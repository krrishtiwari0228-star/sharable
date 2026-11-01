"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle, CheckCircle2, FileUp, Image as ImageIcon, LoaderCircle, PackageCheck, ScanText, Upload } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import styles from "./catalogue-import.module.css";

type OCRWord = { text: string; left: number; top: number; width: number; height: number; confidence: number };
type OCRLine = { words: OCRWord[]; text: string; x0: number; y0: number; x1: number; y1: number; confidence: number };
type CatalogueProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  size: string;
  masterPack: string;
  price: string;
  page: number;
  imageKey: string;
  imageData: string;
  confidence: number;
  needsReview: boolean;
  reviewed: boolean;
  selected: boolean;
};
type PhotoGroup = { key: string; page: number; index: number; data: string };

const CATEGORY_WORDS = ["KITCHENWARE", "HOMEWARE", "GLASSWARE", "CROCKERY", "TABLEWARE", "DINNERWARE", "GIFTWARE", "PLASTICWARE", "COOKWARE"];

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()).trim();
}

function parseTsv(tsv: string): OCRLine[] {
  const lines = new Map<string, OCRLine>();
  const rows = tsv.split(/\r?\n/);
  for (const row of rows.slice(1)) {
    const cells = row.split("\t");
    if (cells.length < 12 || cells[0] !== "5") continue;
    const text = (cells.slice(11).join("\t") || "").trim();
    const confidence = Number(cells[10]);
    if (!text || !Number.isFinite(confidence) || confidence < 0) continue;
    const word: OCRWord = {
      text,
      left: Number(cells[6]) || 0,
      top: Number(cells[7]) || 0,
      width: Number(cells[8]) || 0,
      height: Number(cells[9]) || 0,
      confidence
    };
    const key = cells.slice(2, 5).join(":");
    const existing = lines.get(key);
    if (existing) {
      existing.words.push(word);
      existing.text += " " + text;
      existing.x0 = Math.min(existing.x0, word.left);
      existing.y0 = Math.min(existing.y0, word.top);
      existing.x1 = Math.max(existing.x1, word.left + word.width);
      existing.y1 = Math.max(existing.y1, word.top + word.height);
      existing.confidence = (existing.confidence + confidence) / 2;
    } else {
      lines.set(key, {
        words: [word],
        text,
        x0: word.left,
        y0: word.top,
        x1: word.left + word.width,
        y1: word.top + word.height,
        confidence
      });
    }
  }
  return Array.from(lines.values()).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

function findSku(line: OCRLine) {
  const ignored = new Set(["MRP", "HSN", "CODE", "SIZE", "PACK", "PCS", "SNO"]);
  const pattern = /^[A-Z0-9]+(?:[-/][A-Z0-9]+)+$/;
  for (const word of line.words) {
    const token = word.text.toUpperCase().replace(/[^A-Z0-9/-]/g, "");
    if (ignored.has(token) || !/[A-Z]/.test(token) || !/\d/.test(token) || token.length < 4 || token.length > 24) continue;
    if (pattern.test(token)) return { sku: token, word };
  }
  const joined = line.words.map((word) => word.text).join(" ").toUpperCase();
  const match = joined.match(/\b(?=[A-Z0-9/-]{4,24}\b)(?=[A-Z0-9/-]*[A-Z])(?=[A-Z0-9/-]*\d)[A-Z0-9]+(?:[-/][A-Z0-9]+)*\b/);
  if (!match || ignored.has(match[0])) return null;
  const word = line.words.find((candidate) => candidate.text.toUpperCase().includes(match[0].replace(/[-/]/g, ""))) || line.words[0];
  return { sku: match[0], word };
}

function numericText(word: OCRWord) {
  return word.text.replace(/,/g, "").replace(/[₹]|rs\.?|inr/gi, "").trim();
}

function parsePrice(word?: OCRWord) {
  if (!word) return null;
  const raw = numericText(word);
  if (!/^\d{3,7}(?:\.\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 10 || value > 1000000) return null;
  return value.toString();
}

function findTitle(lines: OCRLine[], row: OCRLine, pageHeight: number) {
  const excluded = /(MRP|PRICE|CODE|SIZE|MASTER|PACK|HSN|GST|S\.?\s*NO|SERIAL|MINTAGE|WWW\.|COM\b)/i;
  const choices = lines
    .filter((line) => line.y1 <= row.y0 && row.y0 - line.y1 < pageHeight * 0.18)
    .filter((line) => !findSku(line) && !excluded.test(line.text))
    .filter((line) => /[A-Z]{2,}/i.test(line.text) && line.text.trim().split(/\s+/).length <= 10)
    .sort((a, b) => (row.y0 - a.y1) - (row.y0 - b.y1));
  return choices[0] || null;
}

function findCategory(lines: OCRLine[], pageHeight: number) {
  const line = lines.find((candidate) => candidate.y0 < pageHeight * 0.34 && CATEGORY_WORDS.some((word) => candidate.text.toUpperCase().includes(word)));
  if (!line) return "";
  const first = line.text.split(/[|/]/)[0].replace(/[^A-Z0-9 &'-]/gi, " ").replace(/\s+/g, " ").trim();
  return first ? titleCase(first) : "";
}

function rowSize(text: string, sku: string) {
  const afterCode = text.toUpperCase().slice(text.toUpperCase().indexOf(sku) + sku.length);
  const match = afterCode.match(/\b\d+(?:\.\d+)?\s*(?:NO\.?|NOS\.?|PCS?|PIECES?|ML|LTRS?|LITRES?|CM|MM|INCHES?|IN|KG|G|SETS?)\b/i);
  return match ? match[0].replace(/\s+/g, " ").trim() : "";
}

function rowMasterPack(text: string, size: string) {
  let remainder = text.toUpperCase();
  if (size) remainder = remainder.replace(size.toUpperCase(), " ");
  const matches = remainder.match(/\b\d+\s*(?:PCS?|PIECES?|NOS?)\b/ig);
  return matches?.[0]?.replace(/\s+/g, " ").trim() || "";
}

function cropPhoto(source: HTMLCanvasElement, left: number, top: number, width: number, height: number) {
  const crop = document.createElement("canvas");
  const scale = Math.min(760 / width, 760 / height, 1);
  crop.width = Math.max(1, Math.floor(width * scale));
  crop.height = Math.max(1, Math.floor(height * scale));
  const context = crop.getContext("2d");
  if (!context) return "";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, crop.width, crop.height);
  context.drawImage(source, left, top, width, height, 0, 0, crop.width, crop.height);
  return crop.toDataURL("image/jpeg", 0.88);
}

function candidateRows(lines: OCRLine[], page: number, pageWidth: number, pageHeight: number, source: HTMLCanvasElement) {
  const detectedCategory = findCategory(lines, pageHeight);
  const groups: Array<{ title: string; titleY: number; firstY: number; lastY: number; x: number; products: Array<{ sku: string; name: string; category: string; size: string; masterPack: string; price: string; confidence: number; y: number }> }> = [];
  for (const line of lines) {
    const found = findSku(line);
    if (!found) continue;
    const titleLine = findTitle(lines, line, pageHeight);
    const name = titleLine ? titleCase(titleLine.text.replace(/[|]/g, " ").replace(/\s+/g, " ").trim()) : "";
    const rowWords = line.words.filter((word) => word.left >= found.word.left && word.left > pageWidth * 0.52);
    const numeric = rowWords.filter((word) => /^\d{3,7}(?:\.\d{1,2})?$/.test(numericText(word))).sort((a, b) => b.left - a.left);
    const fallbackNumeric = line.words.filter((word) => word.left > found.word.left && /^\d{3,7}(?:\.\d{1,2})?$/.test(numericText(word))).sort((a, b) => b.left - a.left);
    const priceWord = numeric[0] || fallbackNumeric[0];
    const price = parsePrice(priceWord) || "";
    const size = rowSize(line.text, found.sku);
    const masterPack = rowMasterPack(line.text, size);
    const confidence = Math.round(Math.min(found.word.confidence, priceWord?.confidence ?? 0, titleLine?.confidence ?? 0));
    const category = detectedCategory;
    const row = { sku: found.sku, name, category, size, masterPack, price, confidence, y: (line.y0 + line.y1) / 2 };
    const sameGroup = groups[groups.length - 1];
    if (sameGroup && sameGroup.title.toLowerCase() === name.toLowerCase() && row.y - sameGroup.lastY < pageHeight * 0.16) {
      sameGroup.lastY = row.y;
      sameGroup.products.push(row);
    } else {
      groups.push({
        title: name,
        titleY: titleLine ? (titleLine.y0 + titleLine.y1) / 2 : row.y,
        firstY: row.y,
        lastY: row.y,
        x: (line.x0 + line.x1) / 2,
        products: [row]
      });
    }
  }
  const photos: PhotoGroup[] = [];
  const products: Array<Omit<CatalogueProduct, "imageData" | "imageKey" | "id" | "page" | "selected" | "reviewed" | "needsReview"> & { page: number; imageKey: string; id: string }> = [];
  groups.forEach((group, index) => {
    const previous = groups[index - 1];
    const next = groups[index + 1];
    let y0 = index === 0 ? pageHeight * 0.05 : (previous.titleY + group.titleY) / 2;
    let y1 = index === groups.length - 1 ? pageHeight * 0.95 : (group.titleY + next.titleY) / 2;
    if (groups.length > 1 && index === 0) y1 = Math.min(y1, group.products[0].y - pageHeight * 0.025);
    y0 = Math.max(0, Math.min(y0, pageHeight - 1));
    y1 = Math.max(y0 + 1, Math.min(y1, pageHeight));
    let x0 = pageWidth * 0.06;
    let x1 = pageWidth * 0.66;
    if (group.x < pageWidth * 0.45) {
      x0 = pageWidth * 0.36;
      x1 = pageWidth * 0.95;
    } else if (group.x >= pageWidth * 0.68) {
      x0 = pageWidth * 0.04;
      x1 = pageWidth * 0.60;
    }
    const key = "page-" + page + "-group-" + (index + 1);
    const imageData = cropPhoto(
      source,
      Math.floor(x0),
      Math.floor(y0),
      Math.floor(x1 - x0),
      Math.floor(y1 - y0)
    );
    photos.push({ key, page, index: index + 1, data: imageData });
    group.products.forEach((product, rowIndex) => {
      const needsReview = !product.sku || !product.name || !product.category || !product.price || product.confidence < 75;
      products.push({
        id: "p" + page + "-g" + (index + 1) + "-r" + (rowIndex + 1),
        sku: product.sku,
        name: product.name,
        category: product.category,
        size: product.size,
        masterPack: product.masterPack,
        price: product.price,
        page,
        imageKey: key,
        confidence: product.confidence,
        needsReview
      });
    });
  });
  return { products, photos };
}

function dataUrlToBlob(dataUrl: string) {
  const [header, body] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
  const bytes = atob(body);
  const output = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) output[i] = bytes.charCodeAt(i);
  return new Blob([output], { type: mime });
}

export default function CatalogueImportPage() {
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState("");
  const [progressText, setProgressText] = useState("");
  const [progress, setProgress] = useState(0);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [success, setSuccess] = useState<{ products: number; images: number } | null>(null);
  const cancelRef = useRef(false);
  const photoGroupsRef = useRef<Map<string, PhotoGroup>>(new Map());

  useEffect(() => {
    let active = true;
    const checkAccess = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (active) {
          setError("This site is not connected to Supabase yet.");
          setReady(true);
        }
        return;
      }
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        window.location.href = "/?workspace=admin";
        return;
      }
      const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (!active) return;
      if (profileError || profile?.role !== "distributor") {
        setError("Only a signed-in distributor can import a catalogue.");
        setReady(true);
        return;
      }
      setAuthorized(true);
      setReady(true);
    };
    void checkAccess();
    return () => { active = false; };
  }, []);

  const selectedCount = useMemo(() => products.filter((product) => product.selected).length, [products]);
  const flaggedCount = useMemo(() => products.filter((product) => product.selected && product.needsReview && !product.reviewed).length, [products]);
  const duplicateSkus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products.filter((row) => row.selected)) {
      const key = product.sku.trim().toUpperCase();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter((entry) => entry[1] > 1).map((entry) => entry[0]));
  }, [products]);
  const invalidCount = useMemo(() => products.filter((product) => product.selected && (!product.sku.trim() || !product.name.trim() || !product.category.trim() || !product.imageData || !Number.isFinite(Number(product.price)) || Number(product.price) <= 0 || duplicateSkus.has(product.sku.trim().toUpperCase()))).length, [products, duplicateSkus]);

  const changeProduct = (id: string, field: "sku" | "name" | "category" | "size" | "masterPack" | "price", value: string) => {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, [field]: value, reviewed: true } : product));
  };

  const analyzePdf = async () => {
    if (!file) return;
    setError("");
    setSuccess(null);
    setProducts([]);
    photoGroupsRef.current.clear();
    cancelRef.current = false;
    setAnalysisBusy(true);
    setProgress(0);
    setOcrProgress(0);
    setProgressText("Loading PDF and OCR tools…");
    let worker: any = null;
    let pdf: any = null;
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const tesseract = await import("tesseract.js");
      const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      pdf = await loading.promise;
      worker = await tesseract.createWorker("eng", 1, {
        logger: (message: any) => {
          if (message.status === "recognizing text") setOcrProgress(Math.round((message.progress || 0) * 100));
        }
      });
      let allProducts: CatalogueProduct[] = [];
      const photos = new Map<string, PhotoGroup>();
      let lastCategory = "";
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (cancelRef.current) break;
        setProgressText("Reading page " + pageNumber + " of " + pdf.numPages + "…");
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1800 / baseViewport.width, 1800 / baseViewport.height, 2);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Your browser could not prepare a page image.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const recognized = await worker.recognize(canvas, {}, { tsv: true } as any);
        const lines = parseTsv(String((recognized.data as any).tsv || ""));
        const pageCategory = findCategory(lines, canvas.height);
        if (pageCategory) lastCategory = pageCategory;
        const detected = candidateRows(lines, pageNumber, canvas.width, canvas.height, canvas);
        for (const photo of detected.photos) photos.set(photo.key, photo);
        allProducts = allProducts.concat(detected.products.map((product) => {
          const category = product.category || lastCategory;
          const needsReview = product.needsReview || !category || !photos.get(product.imageKey)?.data;
          return {
            ...product,
            category,
            imageData: photos.get(product.imageKey)?.data || "",
            selected: true,
            reviewed: !needsReview,
            needsReview
          };
        }));
        setProgress(Math.round((pageNumber / pdf.numPages) * 100));
        setProducts(allProducts);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        canvas.width = 0;
        canvas.height = 0;
      }
      photoGroupsRef.current = photos;
      if (cancelRef.current) {
        setProgressText("Stopped scanning. The pages already read are available to review.");
      } else {
        setProgressText("Finished scanning " + pdf.numPages + " pages. Review the highlighted rows before importing.");
      }
      if (allProducts.length === 0 && !cancelRef.current) setError("No product code and price rows were detected. Try a clearer PDF scan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read this PDF.");
    } finally {
      if (worker) await worker.terminate();
      if (pdf) await pdf.destroy();
      setAnalysisBusy(false);
    }
  };

  const cancelAnalysis = () => {
    cancelRef.current = true;
    setProgressText("Stopping after the current page…");
  };

  const importProducts = async () => {
    const selected = products.filter((product) => product.selected);
    if (!selected.length) {
      setError("Choose at least one product to import.");
      return;
    }
    if (duplicateSkus.size) {
      setError("Some selected products have the same code. Unselect duplicate rows or correct the product codes before importing.");
      return;
    }
    if (invalidCount) {
      setError("Fill in each selected product's code, name, category, and a valid price before importing.");
      return;
    }
    if (flaggedCount) {
      setError("Review the highlighted rows and mark each one as checked before importing.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("This site is not connected to Supabase.");
      return;
    }
    setError("");
    setSuccess(null);
    setImportBusy(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Your session expired. Sign in again.");
      const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profileError) throw profileError;
      if (profile?.role !== "distributor") throw new Error("This account is not configured as a distributor.");
      const { data: distributor, error: distributorError } = await supabase.from("distributors").select("id").eq("owner_id", user.id).eq("is_active", true).maybeSingle();
      if (distributorError) throw distributorError;
      if (!distributor?.id) throw new Error("This account has no active distributor business.");
      setProgressText("Uploading product photos…");
      const groupKeys = Array.from(new Set(selected.map((product) => product.imageKey).filter(Boolean)));
      const imageUrls = new Map<string, string>();
      for (let offset = 0; offset < groupKeys.length; offset += 4) {
        const batch = groupKeys.slice(offset, offset + 4);
        await Promise.all(batch.map(async (key) => {
          const group = photoGroupsRef.current.get(key);
          if (!group?.data) return;
          const blob = dataUrlToBlob(group.data);
          const rowsForImage = selected.filter((product) => product.imageKey === key);
          const safeSku = (rowsForImage[0]?.sku || "catalogue").replace(/[^A-Z0-9_-]/gi, "_").slice(0, 40);
          const path = distributor.id + "/catalogue/page-" + group.page + "-item-" + group.index + "-" + safeSku + ".jpg";
          const { error: uploadError } = await supabase.storage.from("product-images").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
          if (uploadError) throw new Error("Could not upload photo for PDF page " + group.page + ": " + uploadError.message);
          const { data } = supabase.storage.from("product-images").getPublicUrl(path);
          imageUrls.set(key, data.publicUrl);
        }));
        setProgressText("Uploaded " + Math.min(offset + batch.length, groupKeys.length) + " of " + groupKeys.length + " product photos…");
      }
      const { data: existingCategories, error: categoryReadError } = await supabase.from("categories").select("id,name").eq("distributor_id", distributor.id);
      if (categoryReadError) throw categoryReadError;
      const categoryIds = new Map<string, string>();
      for (const category of existingCategories || []) categoryIds.set(String(category.name).toLowerCase(), category.id);
      const categoryNames = Array.from(new Set(selected.map((product) => product.category.trim())));
      for (const name of categoryNames) {
        if (categoryIds.has(name.toLowerCase())) continue;
        const { data: created, error: createError } = await supabase.from("categories").insert({ distributor_id: distributor.id, name }).select("id,name").single();
        if (createError) throw createError;
        categoryIds.set(String(created.name).toLowerCase(), created.id);
      }
      let imported = 0;
      for (let offset = 0; offset < selected.length; offset += 25) {
        const batch = selected.slice(offset, offset + 25).map((product) => {
          const categoryId = categoryIds.get(product.category.trim().toLowerCase());
          if (!categoryId) throw new Error("Could not resolve category " + product.category + ".");
          const details = [product.size ? "Size: " + product.size : "", product.masterPack ? "Master pack: " + product.masterPack : ""].filter(Boolean).join(" · ");
          const groupPhoto = imageUrls.get(product.imageKey);
          return {
            distributor_id: distributor.id,
            category_id: categoryId,
            sku: product.sku.trim().toUpperCase(),
            name: product.name.trim(),
            brand: "Mintage",
            description: details || null,
            image_path: groupPhoto || null,
            unit_label: "piece",
            pieces_per_unit: 1,
            minimum_order_quantity: 1,
            price: Number(product.price),
            stock_on_hand: 0,
            stock_reserved: 0,
            is_active: true
          };
        });
        const { data: saved, error: saveError } = await supabase.from("products").upsert(batch, { onConflict: "distributor_id,sku" }).select("id");
        if (saveError) throw new Error("Product save stopped after " + imported + " rows: " + saveError.message);
        imported += (saved || []).length;
        setProgressText("Saved " + imported + " of " + selected.length + " catalogue products…");
      }
      setSuccess({ products: imported, images: imageUrls.size });
      setProgressText("Catalogue import completed.");
      setProducts((current) => current.map((product) => ({ ...product, selected: false })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The catalogue import could not be completed.");
    } finally {
      setImportBusy(false);
    }
  };

  if (!ready) {
    return <main className={styles.center}><LoaderCircle className={styles.spin} size={24} /><p>Checking distributor access…</p></main>;
  }

  if (!authorized) {
    return <main className={styles.center}><AlertCircle size={25} /><h1>Catalogue import unavailable</h1><p>{error || "Sign in as the distributor administrator to continue."}</p><Link className={styles.button} href="/?workspace=admin">Back to SupplyDesk</Link></main>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <Link href="/?workspace=admin" className={styles.back}><ArrowLeft size={16} /> Back to SupplyDesk</Link>
        <header className={styles.heading}>
          <div className={styles.icon}><ScanText size={24} /></div>
          <div><p className={styles.eyebrow}>SUPPLYDESK · DISTRIBUTOR TOOLS</p><h1>Import a product catalogue</h1><p>Upload a catalogue PDF. SupplyDesk reads the product codes, names, sizes and prices, then crops product photos from each page.</p></div>
        </header>

        {!products.length && (
          <section className={styles.uploadPanel}>
            <label className={styles.dropzone}>
              <input type="file" accept="application/pdf,.pdf" onChange={(event) => { setFile(event.target.files?.[0] || null); setError(""); setSuccess(null); }} />
              <span className={styles.uploadIcon}><FileUp size={26} /></span>
              <strong>{file ? file.name : "Choose a catalogue PDF"}</strong>
              <span>{file ? (file.size / (1024 * 1024)).toFixed(1) + " MB · Ready to scan" : "PDF files only · Scanned catalogues are supported"}</span>
              <span className={styles.chooseButton}><Upload size={15} /> Browse files</span>
            </label>
            <p className={styles.privacy}><CheckCircle2 size={15} /> Scanning runs in this browser. Product details and cropped photos are saved only after you review and import them.</p>
            {error && <div className={styles.error}><AlertCircle size={17} />{error}</div>}
            {analysisBusy && <div className={styles.progressPanel}>
              <div className={styles.progressTitle}><span>{progressText}</span><strong>{progress}%</strong></div>
              <div className={styles.track}><div style={{ width: progress + "%" }} /></div>
              <p>Reading page text: {ocrProgress}%</p>
              <button className={styles.textButton} type="button" onClick={cancelAnalysis}>Stop scanning</button>
            </div>}
            <div className={styles.uploadActions}>
              <button type="button" className={styles.primaryButton} onClick={analyzePdf} disabled={!file || analysisBusy}>
                {analysisBusy ? <><LoaderCircle className={styles.spin} size={17} /> Scanning PDF…</> : <><ScanText size={17} /> Scan catalogue</>}
              </button>
            </div>
          </section>
        )}

        {products.length > 0 && (
          <>
            <section className={styles.summary}>
              <div><strong>{products.length}</strong><span>product rows found</span></div>
              <div><strong>{selectedCount}</strong><span>selected to import</span></div>
              <div><strong>{flaggedCount}</strong><span>need review</span></div>
              <button type="button" className={styles.secondaryButton} onClick={() => { setProducts([]); setFile(null); setError(""); setSuccess(null); }}>Start over</button>
            </section>
            {success && <div className={styles.success}><PackageCheck size={19} /><div><strong>Catalogue saved</strong><span>{success.products} products saved and {success.images} product photos uploaded.</span></div><Link href="/?workspace=admin">Return to SupplyDesk</Link></div>}
            <p className={styles.reviewNote}><AlertCircle size={16} /> Orange rows have uncertain or missing OCR details. Correct them and check “I reviewed this row” before importing.</p>
            {error && <div className={styles.error}><AlertCircle size={17} />{error}</div>}
            {analysisBusy && <div className={styles.progressPanel}>
              <div className={styles.progressTitle}><span>{progressText}</span><strong>{progress}%</strong></div>
              <div className={styles.track}><div style={{ width: progress + "%" }} /></div>
              <p>Reading page text: {ocrProgress}%</p>
              <button className={styles.textButton} type="button" onClick={cancelAnalysis}>Stop scanning</button>
            </div>}
            <div className={styles.listHeader}><div><h2>Review detected products</h2><p>Prices are saved as MRP per piece. Each product can use the photo cropped from its catalogue page.</p></div><button type="button" className={styles.primaryButton} disabled={importBusy || analysisBusy || !selectedCount} onClick={importProducts}>{importBusy ? <><LoaderCircle className={styles.spin} size={17} /> Saving…</> : <><PackageCheck size={17} /> Import {selectedCount} products</>}</button></div>
            <div className={styles.productList}>
              {products.map((product) => (
                <article className={styles.productRow + (product.needsReview && !product.reviewed ? " " + styles.flagged : "")} key={product.id}>
                  <div className={styles.rowSelect}><input type="checkbox" checked={product.selected} onChange={(event) => setProducts((current) => current.map((row) => row.id === product.id ? { ...row, selected: event.target.checked } : row))} aria-label={"Select " + product.sku} /></div>
                  <div className={styles.photoBox}>{product.imageData ? <img src={product.imageData} alt={"Catalogue crop for " + (product.name || product.sku)} /> : <div className={styles.noPhoto}><ImageIcon size={20} /><span>No crop</span></div>}<small>Page {product.page}</small></div>
                  <div className={styles.fields}>
                    <label>Product code<input value={product.sku} onChange={(event) => changeProduct(product.id, "sku", event.target.value.toUpperCase())} /></label>
                    <label>Product name<input value={product.name} onChange={(event) => changeProduct(product.id, "name", event.target.value)} /></label>
                    <label>Category<input value={product.category} onChange={(event) => changeProduct(product.id, "category", event.target.value)} /></label>
                    <label>Size / capacity<input value={product.size} onChange={(event) => changeProduct(product.id, "size", event.target.value)} placeholder="Not detected" /></label>
                    <label>MRP per piece (₹)<input type="number" min="0" step="0.01" value={product.price} onChange={(event) => changeProduct(product.id, "price", event.target.value)} /></label>
                    <label>Master pack<input value={product.masterPack} onChange={(event) => changeProduct(product.id, "masterPack", event.target.value)} placeholder="Not detected" /></label>
                    <div className={styles.rowMeta}><span>OCR confidence: {product.confidence}%</span>{product.needsReview && !product.reviewed && <label className={styles.reviewCheck}><input type="checkbox" checked={product.reviewed} onChange={(event) => setProducts((current) => current.map((row) => row.id === product.id ? { ...row, reviewed: event.target.checked } : row))} /> I reviewed this row</label>}</div>
                  </div>
                </article>
              ))}
            </div>
            <div className={styles.bottomActions}>
              <span>{invalidCount ? invalidCount + " selected rows need required details." : flaggedCount ? flaggedCount + " selected rows still need review." : "Ready to save the selected products."}</span>
              <button type="button" className={styles.primaryButton} disabled={importBusy || analysisBusy || !selectedCount} onClick={importProducts}>{importBusy ? "Saving…" : "Import " + selectedCount + " products"}</button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
