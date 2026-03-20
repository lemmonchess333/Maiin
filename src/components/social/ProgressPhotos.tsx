import { useState, useRef, useCallback, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { addDoc, collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { Camera, Lock, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { THEME } from '../../lib/theme';
import { EmptyState } from '../EmptyState';

async function getEncryptionKey(uid: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(uid + '_tropos_photos_v1'), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('tropos-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function encryptBlob(data: ArrayBuffer, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, data);
  return { encrypted, iv };
}

async function decryptBlob(encrypted: ArrayBuffer, key: CryptoKey, iv: Uint8Array) {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, encrypted);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Upload timed out')), ms)),
  ]);
}

export default function ProgressPhotos() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<{ id: string; date: string; storagePath: string; iv: number[] }[]>([]);
  const [decryptedUrls, setDecryptedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [isPrivate, setIsPrivate] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [decrypting, setDecrypting] = useState<Set<string>>(new Set());
  const [uploadError, setUploadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const pendingFileRef = useRef<File | null>(null);

  // Helper to cache encryption key (#14)
  const getOrDeriveKey = useCallback(async (uid: string): Promise<CryptoKey> => {
    if (keyRef.current) return keyRef.current;
    const key = await getEncryptionKey(uid);
    keyRef.current = key;
    return key;
  }, []);

  // Revoke object URLs on unmount to prevent memory leaks (#13)
  useEffect(() => {
    return () => {
      Object.values(decryptedUrls).forEach(url => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPhotos = useCallback(async () => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'progressPhotos'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    setPhotos(snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; date: string; storagePath: string; iv: number[] })));
  }, [user]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  // Auto-decrypt the 6 most recent photos on mount
  useEffect(() => {
    if (photos.length === 0 || !user) return;

    const autoDecrypt = async () => {
      const key = await getOrDeriveKey(user.uid);

      for (const photo of photos.slice(0, 6)) {
        if (decryptedUrls[photo.id]) continue;

        setDecrypting(prev => new Set(prev).add(photo.id));
        try {
          const storageRef = ref(storage, photo.storagePath);
          const url = await getDownloadURL(storageRef);
          const response = await fetch(url);
          const encryptedBuffer = await response.arrayBuffer();
          const iv = new Uint8Array(photo.iv);
          const decrypted = await decryptBlob(encryptedBuffer, key, iv);
          const blob = new Blob([decrypted], { type: 'image/webp' });
          const objectUrl = URL.createObjectURL(blob);
          setDecryptedUrls(prev => ({ ...prev, [photo.id]: objectUrl }));
        } catch (err) {
          console.error(`Auto-decrypt failed for photo ${photo.id}:`, err);
        } finally {
          setDecrypting(prev => {
            const next = new Set(prev);
            next.delete(photo.id);
            return next;
          });
        }
      }
    };

    autoDecrypt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, user]);

  const decryptPhoto = useCallback(async (photo: typeof photos[0]) => {
    if (!user || decryptedUrls[photo.id]) return;
    const key = await getOrDeriveKey(user.uid);
    const storageRef = ref(storage, photo.storagePath);
    const url = await getDownloadURL(storageRef);
    const response = await fetch(url);
    const encryptedBuffer = await response.arrayBuffer();
    const iv = new Uint8Array(photo.iv);
    const decrypted = await decryptBlob(encryptedBuffer, key, iv);
    const blob = new Blob([decrypted], { type: 'image/webp' });
    const objectUrl = URL.createObjectURL(blob);
    setDecryptedUrls(prev => ({ ...prev, [photo.id]: objectUrl }));
  }, [user, decryptedUrls, getOrDeriveKey]);

  const uploadFile = useCallback(async (file: File) => {
    if (!user) return;
    setLoading(true);
    setUploadError(false);
    try {
      console.log('[UPLOAD] Current user:', user.uid);
      console.log('[UPLOAD] 1. Image picked:', { name: file.name, size: file.size, type: file.type });

      // Step 1: Compress image
      let blob: Blob;
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        const scale = Math.min(1920 / bitmap.width, 1920 / bitmap.height, 1);
        canvas.width = bitmap.width * scale;
        canvas.height = bitmap.height * scale;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/webp', 0.8));
        console.log('[UPLOAD] 2. Compressed image:', { width: canvas.width, height: canvas.height, blobSize: blob.size });
      } catch (e) {
        console.error('[UPLOAD] Image compression failed:', e);
        throw new Error('Failed to compress image');
      }

      // Step 2: Encrypt
      let encrypted: ArrayBuffer;
      let iv: Uint8Array;
      let key: CryptoKey;
      const skipEncryption = !isPrivate && typeof crypto?.subtle?.encrypt !== 'function';
      console.log('[UPLOAD] 3. Starting encryption...', { skipEncryption, isPrivate });
      try {
        key = await getOrDeriveKey(user.uid);
        const result = await encryptBlob(await blob.arrayBuffer(), key);
        encrypted = result.encrypted;
        iv = result.iv;
        console.log('[UPLOAD] 4. Encryption complete, encrypted size:', encrypted.byteLength);
      } catch (e) {
        console.error('[UPLOAD] Encryption failed:', e);
        // Fallback: upload unencrypted if encryption fails
        console.log('[UPLOAD] 4b. Falling back to unencrypted upload');
        encrypted = await blob.arrayBuffer();
        iv = new Uint8Array(12); // zero IV indicates unencrypted
        key = null as unknown as CryptoKey;
      }

      // Step 3: Upload to Firebase Storage
      // NOTE: Requires VITE_FIREBASE_STORAGE_BUCKET env var to be set (see firebase.ts)
      const path = `progress-photos/${user.uid}/${Date.now()}${iv.some(b => b !== 0) ? '.enc' : '.webp'}`;
      console.log('[UPLOAD] 5. Creating Firebase Storage reference:', path);
      try {
        await withTimeout(
          uploadBytes(ref(storage, path), new Uint8Array(encrypted), { contentType: 'image/webp' }),
          25000
        );
        console.log('[UPLOAD] 6. Upload complete');
      } catch (e) {
        console.error('[UPLOAD] Firebase Storage upload failed:', e);
        throw e;
      }

      // Step 4: Write Firestore document
      console.log('[UPLOAD] 7. Writing Firestore document...');
      let docRef;
      try {
        docRef = await addDoc(collection(db, 'users', user.uid, 'progressPhotos'), {
          storagePath: path,
          iv: Array.from(iv),
          date: new Date().toISOString().split('T')[0],
          visibility: isPrivate ? 'private' : 'public',
          createdAt: Timestamp.now(),
        });
        console.log('[UPLOAD] 8. Firestore write complete, docId:', docRef.id);
      } catch (e) {
        console.error('[UPLOAD] Firestore write failed:', e);
        throw new Error('Failed to save photo metadata');
      }

      await loadPhotos();

      // Auto-decrypt/display newly uploaded photo
      try {
        if (iv.some(b => b !== 0) && key) {
          const newUrl = await getDownloadURL(ref(storage, path));
          const encResponse = await fetch(newUrl);
          const encBuffer = await encResponse.arrayBuffer();
          const decryptedData = await decryptBlob(encBuffer, key, iv);
          const decBlob = new Blob([decryptedData], { type: 'image/webp' });
          const objectUrl = URL.createObjectURL(decBlob);
          setDecryptedUrls(prev => ({ ...prev, [docRef.id]: objectUrl }));
        } else {
          // Unencrypted — create URL from the original blob
          const objectUrl = URL.createObjectURL(blob);
          setDecryptedUrls(prev => ({ ...prev, [docRef.id]: objectUrl }));
        }
      } catch (e) {
        console.error('[UPLOAD] Auto-decrypt after upload failed (non-critical):', e);
      }

      toast.success('Photo uploaded!');
    } catch (err) {
      console.error('[UPLOAD] Upload failed:', err);
      setUploadError(true);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [user, loadPhotos, isPrivate, getOrDeriveKey]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    pendingFileRef.current = file;
    await uploadFile(file);
  }, [user, uploadFile]);

  const retryUpload = useCallback(async () => {
    if (!pendingFileRef.current) return;
    setUploadError(false);
    await uploadFile(pendingFileRef.current);
  }, [uploadFile]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Progress Photos</h3>
        <div className="flex gap-2">
          {photos.length >= 2 && (
            <button onClick={() => { setCompareMode(!compareMode); setSelected([]); }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium ${compareMode ? 'bg-blue-500 text-white' : 'bg-muted'}`}>
              Compare
            </button>
          )}
          <button onClick={() => fileInputRef.current?.click()}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-500 text-white font-medium">
            + Add
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleUpload} className="hidden" />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Keep photos private</span>
        <button
          onClick={() => setIsPrivate(v => !v)}
          className={`w-9 h-5 rounded-full transition-colors relative ${isPrivate ? 'bg-primary' : 'bg-muted border border-border'}`}
        >
          <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform shadow-sm ${isPrivate ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
          <Loader2 size={16} className="animate-spin text-primary shrink-0" />
          <p className="text-xs text-foreground font-medium">Encrypting & uploading your photo...</p>
        </div>
      )}

      {uploadError && !loading && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-destructive/10 border border-destructive/20">
          <p className="text-xs text-destructive">Upload failed. Please try again.</p>
          <button onClick={retryUpload}
            className="flex items-center gap-1 text-xs font-medium text-destructive ml-2 shrink-0">
            <RotateCcw size={12} />
            Retry
          </button>
        </div>
      )}

      {photos.length === 0 && (
        <EmptyState
          icon={<Camera size={28} />}
          title="Track your transformation"
          description="Take a front, side, and back photo each week to see your progress over time."
          accentColor={THEME.brand}
        />
      )}

      <div className="grid grid-cols-3 gap-2">
        {photos.map(photo => (
          <button key={photo.id}
            onClick={() => {
              decryptPhoto(photo);
              if (compareMode) {
                setSelected(prev => prev.includes(photo.id)
                  ? prev.filter(id => id !== photo.id)
                  : prev.length < 2 ? [...prev, photo.id] : prev);
              }
            }}
            className={`aspect-[3/4] rounded-lg overflow-hidden border-2 ${
              selected.includes(photo.id) ? 'border-purple-500' : 'border-transparent'
            }`}>
            {decrypting.has(photo.id) ? (
              <div className="w-full h-full bg-muted flex flex-col items-center justify-center">
                <Loader2 size={16} className="text-muted-foreground animate-spin" />
                <span className="text-[10px] text-muted-foreground mt-1">{photo.date}</span>
              </div>
            ) : decryptedUrls[photo.id] ? (
              <img
                src={decryptedUrls[photo.id]}
                className="w-full h-full object-cover"
                alt={`Progress from ${photo.date}`}
                loading="lazy"
                decoding="async"
                onError={(e) => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full bg-muted flex flex-col items-center justify-center">
                <Lock size={16} className="text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground mt-1">{photo.date}</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {compareMode && selected.length === 2 && (
        <div className="flex gap-2 mt-4">
          {selected.map(id => (
            <div key={id} className="flex-1 aspect-[3/4] rounded-xl overflow-hidden">
              {decryptedUrls[id] && (
                <img
                  src={decryptedUrls[id]}
                  className="w-full h-full object-cover"
                  alt={`Progress from ${photos.find(p => p.id === id)?.date || 'unknown date'}`}
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
