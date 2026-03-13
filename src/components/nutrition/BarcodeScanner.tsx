import { useState, useRef, useEffect, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { motion, AnimatePresence } from "framer-motion";
import { ScanLine, X, Plus, Minus, Check, AlertCircle } from "lucide-react";

interface NutrientData {
  name: string;
  brand?: string;
  servingSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  barcode: string;
}

interface BarcodeScannerProps {
  onLog: (food: NutrientData & { servings: number }) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onLog, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(true);
  const [product, setProduct] = useState<NutrientData | null>(null);
  const [servings, setServings] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchProduct = useCallback(async (barcode: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`
      );
      const data = await resp.json();

      if (data.status !== 1 || !data.product) {
        setError("Product not found. Try manual entry instead.");
        setLoading(false);
        return;
      }

      const p = data.product;
      const n = p.nutriments || {};
      const serving = p.serving_size || p.quantity || "1 serving";

      setProduct({
        name: p.product_name || "Unknown Product",
        brand: p.brands || undefined,
        servingSize: serving,
        calories: Math.round(n["energy-kcal_serving"] || n["energy-kcal_100g"] || 0),
        protein: Math.round((n.proteins_serving || n.proteins_100g || 0) * 10) / 10,
        carbs: Math.round((n.carbohydrates_serving || n.carbohydrates_100g || 0) * 10) / 10,
        fat: Math.round((n.fat_serving || n.fat_100g || 0) * 10) / 10,
        fiber: n.fiber_serving != null ? Math.round(n.fiber_serving * 10) / 10 : undefined,
        sugar: n.sugars_serving != null ? Math.round(n.sugars_serving * 10) / 10 : undefined,
        sodium: n.sodium_serving != null ? Math.round(n.sodium_serving * 1000) : undefined,
        barcode,
      });
    } catch {
      setError("Failed to look up product. Check your connection.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!scanning) return;

    const videoEl = videoRef.current;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    reader.decodeFromVideoDevice(
      undefined,
      videoEl!,
      (result) => {
        if (result) {
          const code = result.getText();
          setScanning(false);
          fetchProduct(code);
        }
      }
    ).catch(() => {
      setError("Camera access denied. Please allow camera permissions.");
      setScanning(false);
    });

    return () => {
      // Stop any active video streams
      if (videoEl?.srcObject) {
        (videoEl.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [scanning, fetchProduct]);

  const handleConfirm = () => {
    if (!product) return;
    onLog({ ...product, servings });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-primary" />
          Barcode Scanner
        </h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <AnimatePresence mode="wait">
        {scanning && (
          <motion.div
            key="scanner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]"
          >
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-48 h-1 bg-primary rounded-full shadow-[0_0_16px_rgba(139,92,246,0.5)]"
              />
            </div>
            <div className="absolute bottom-3 left-0 right-0 text-center">
              <p className="text-xs text-white/70">Point camera at barcode</p>
            </div>
          </motion.div>
        )}

        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-12 text-center"
          >
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Looking up product...</p>
          </motion.div>
        )}

        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 space-y-3"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
            <button
              onClick={() => { setError(null); setScanning(true); }}
              className="w-full py-2 rounded-xl bg-muted text-sm font-medium"
            >
              Try Again
            </button>
          </motion.div>
        )}

        {product && !loading && (
          <motion.div
            key="product"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{product.name}</p>
                {product.brand && (
                  <p className="text-xs text-muted-foreground">{product.brand}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Serving: {product.servingSize}
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-orange-500/10 p-2">
                  <p className="text-sm font-bold text-orange-500">
                    {Math.round(product.calories * servings)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">cal</p>
                </div>
                <div className="rounded-lg bg-blue-500/10 p-2">
                  <p className="text-sm font-bold text-blue-500">
                    {Math.round(product.protein * servings)}g
                  </p>
                  <p className="text-[10px] text-muted-foreground">protein</p>
                </div>
                <div className="rounded-lg bg-amber-500/10 p-2">
                  <p className="text-sm font-bold text-amber-500">
                    {Math.round(product.carbs * servings)}g
                  </p>
                  <p className="text-[10px] text-muted-foreground">carbs</p>
                </div>
                <div className="rounded-lg bg-purple-500/10 p-2">
                  <p className="text-sm font-bold text-purple-500">
                    {Math.round(product.fat * servings)}g
                  </p>
                  <p className="text-[10px] text-muted-foreground">fat</p>
                </div>
              </div>

              {(product.fiber != null || product.sugar != null || product.sodium != null) && (
                <div className="flex gap-3 text-xs text-muted-foreground border-t border-border/30 pt-2">
                  {product.fiber != null && <span>Fiber: {Math.round(product.fiber * servings)}g</span>}
                  {product.sugar != null && <span>Sugar: {Math.round(product.sugar * servings)}g</span>}
                  {product.sodium != null && <span>Sodium: {Math.round(product.sodium * servings)}mg</span>}
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setServings(Math.max(0.5, servings - 0.5))}
                className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{servings}</p>
                <p className="text-[10px] text-muted-foreground">servings</p>
              </div>
              <button
                onClick={() => setServings(servings + 0.5)}
                className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setProduct(null); setScanning(true); setServings(1); }}
                className="flex-1 py-3 rounded-xl bg-muted text-sm font-medium"
              >
                Scan Again
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Log Food
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
