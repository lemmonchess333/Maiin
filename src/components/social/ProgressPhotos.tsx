import { useState, useRef, useCallback, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { addDoc, collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';

async function getEncryptionKey(uid: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(uid + '_maiin_photos_v1'), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('maiin-salt'), iterations: 100000, hash: 'SHA-256' },
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

export default function ProgressPhotos() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<{ id: string; date: string; storagePath: string; iv: number[] }[]>([]);
  const [decryptedUrls, setDecryptedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPhotos = useCallback(async () => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'progressPhotos'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    setPhotos(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
  }, [user]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const decryptPhoto = useCallback(async (photo: typeof photos[0]) => {
    if (!user || decryptedUrls[photo.id]) return;
    const key = await getEncryptionKey(user.uid);
    const storageRef = ref(storage, photo.storagePath);
    const url = await getDownloadURL(storageRef);
    const response = await fetch(url);
    const encryptedBuffer = await response.arrayBuffer();
    const iv = new Uint8Array(photo.iv);
    const decrypted = await decryptBlob(encryptedBuffer, key, iv);
    const blob = new Blob([decrypted], { type: 'image/webp' });
    const objectUrl = URL.createObjectURL(blob);
    setDecryptedUrls(prev => ({ ...prev, [photo.id]: objectUrl }));
  }, [user, decryptedUrls]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files?.[0]) return;
    setLoading(true);
    try {
      const file = e.target.files[0];
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1920 / bitmap.width, 1920 / bitmap.height, 1);
      canvas.width = bitmap.width * scale;
      canvas.height = bitmap.height * scale;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/webp', 0.8));

      const key = await getEncryptionKey(user.uid);
      const { encrypted, iv } = await encryptBlob(await blob.arrayBuffer(), key);

      const path = `progress-photos/${user.uid}/${Date.now()}.enc`;
      await uploadBytes(ref(storage, path), new Uint8Array(encrypted));

      await addDoc(collection(db, 'users', user.uid, 'progressPhotos'), {
        storagePath: path,
        iv: Array.from(iv),
        date: new Date().toISOString().split('T')[0],
        createdAt: Timestamp.now(),
      });
      loadPhotos();
    } catch (err) { console.error('Upload failed:', err); }
    setLoading(false);
  }, [user, loadPhotos]);

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

      {loading && <p className="text-xs text-muted-foreground animate-pulse">Encrypting & uploading...</p>}

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
            {decryptedUrls[photo.id] ? (
              <img src={decryptedUrls[photo.id]} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full bg-muted flex flex-col items-center justify-center">
                <span className="text-lg">🔒</span>
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
              {decryptedUrls[id] && <img src={decryptedUrls[id]} className="w-full h-full object-cover" alt="" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
