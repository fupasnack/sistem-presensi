// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA08VBr5PfN5HB7_eub0aZ9-_FSFFHM62M",
  authDomain: "presence-system-adfd7.firebaseapp.com",
  projectId: "presence-system-adfd7",
  storageBucket: "presence-system-adfd7.firebasestorage.app",
  messagingSenderId: "84815583677",
  appId: "1:84815583677:web:12e743b9f5c2b0cb395ad4",
  measurementId: "G-HHJREDRFZB"
};

// Cloudinary
const CLOUD_NAME = "dn2o2vf04";
const UPLOAD_PRESET = "presensi_unsigned";

// UID roles
const ADMIN_UIDS = new Set([
  "DsBQ1TdWjgXvpVHUQJpF1H6jZzJ3", // karomi@fupa.id
  "xxySAjSMqKeq7SC6r5vyzes7USY2"  // annisa@fupa.id
]);

const KARYAWAN_UIDS = new Set([
  "y2MTtiGZcVcts2MkQncckAaUasm2", // x@fupa.id
  "4qwoQhWyZmatqkRYaENtz5Uw8fy1", // cabang1@fupa.id
  "UkIHdrTF6vefeuzp94ttlmxZzqk2", // cabang2@fupa.id
  "kTpmDbdBETQT7HIqT6TvpLwrbQf2", // cabang3@fupa.id
  "15FESE0b7cQFKqdJSqNBTZlHqWR2", // cabang4@fupa.id
  "1tQidUDFTjRTJdJJYIudw9928pa2", // cabang5@fupa.id
  "7BCcTwQ5wDaxWA6xbzJX9VWj1o52", // cabang6@fupa.id
  "mpyFesOjUIcs8O8Sh3tVLS8x7dA3", // cabang7@fupa.id
  "2jV2is3MQRhv7nnd1gXeqiaj11t2", // cabang8@fupa.id
  "or2AQDVY1hdpwT0YOmL4qJrgCju1", // cabang9@fupa.id
  "HNJ52lywYVaUhRK3BNEARfQsQo22"  // cabang10@fupa.id
]);

// Inisialisasi Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Util UI
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const toast = (msg, isError = false) => {
  const t = $("#toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.style.background = isError ? '#c62828' : '#2e7d32';
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 3000);
};

// PWA register SW
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}

// Notifikasi browser
async function ensureNotificationPermission() {
  try {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission !== "denied") {
      const res = await Notification.requestPermission();
      return res === "granted";
    }
    return false;
  } catch { return false; }
}

function notify(msg) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("Presensi FUPA", { 
      body: msg,
      icon: 'https://api.iconify.design/material-symbols/workspace-premium.svg?color=%23ffb300'
    });
  }
}

// Dapatkan server time via Firestore
async function getServerTime() {
  try {
    const docRef = db.collection("_meta").doc("_srv");
    const snap = await docRef.get();
    const ts = snap.get("t");
    return ts ? ts.toDate() : new Date();
  } catch (error) {
    console.error("Error getting server time:", error);
    return new Date();
  }
}

function fmtDateTime(d) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtHM(d) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sameYMD(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Aturan hari & jam
const WINDOW = {
  berangkat: { start: {h:4,m:30}, end:{h:5,m:30} },
  pulang:    { start: {h:10,m:0}, end:{h:11,m:0} }
};

function inWindow(d, jenis, extraLateMin = 30) {
  const w = WINDOW[jenis];
  const start = new Date(d); 
  start.setHours(w.start.h, w.start.m, 0, 0);
  const end = new Date(d);   
  end.setHours(w.end.h, w.end.m, 0, 0);
  const lateEnd = new Date(end.getTime() + extraLateMin * 60000);
  
  if (d < start) return {allowed: false, status: "dilarang"};
  if (d >= start && d <= end) return {allowed: true, status: "tepat"};
  if (d > end && d <= lateEnd) return {allowed: true, status: "terlambat"};
  return {allowed: false, status: "dilarang"};
}

async function getScheduleOverride(dateYMD) {
  try {
    const doc = await db.collection("_settings").doc("today").get();
    if (doc.exists) {
      const d = doc.data();
      if (d.date === dateYMD) return d.mode;
    }
    return "auto";
  } catch (error) {
    console.error("Error getting schedule override:", error);
    return "auto";
  }
}

function ymd(d) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// Role guard
function redirectByRole(uid, pathIfAdmin, pathIfKaryawan) {
  if (ADMIN_UIDS.has(uid)) {
    if (!location.pathname.endsWith(pathIfAdmin)) {
      location.href = pathIfAdmin;
    }
  } else if (KARYAWAN_UIDS.has(uid)) {
    if (!location.pathname.endsWith(pathIfKaryawan)) {
      location.href = pathIfKaryawan;
    }
  } else {
    auth.signOut();
    toast("Akses ditolak: akun belum diberi peran yang benar.", true);
  }
}

function guardPage(uid, required) {
  const isAdmin = ADMIN_UIDS.has(uid);
  const isKaryawan = KARYAWAN_UIDS.has(uid);
  
  if (required === "admin" && !isAdmin) { 
    location.href = "index.html"; 
    return false; 
  }
  
  if (required === "karyawan" && !isKaryawan) { 
    location.href = "index.html"; 
    return false; 
  }
  
  return true;
}

// Fungsi untuk memeriksa koneksi Firestore (Diperbarui)
async function checkFirestoreConnection() {
  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Timeout")), 5000)
    );
    
    const connectionPromise = (async () => {
      const docRef = db.collection("_meta").doc("connectionTest");
      await docRef.set({ 
        test: true, 
        timestamp: firebase.firestore.FieldValue.serverTimestamp() 
      });
      await docRef.delete();
      return true;
    })();
    
    return await Promise.race([connectionPromise, timeoutPromise]);
  } catch (error) {
    console.error("Koneksi Firestore gagal:", error);
    return false;
  }
}

// Auto bootstrap koleksi & dokumen penting (Diperbarui sepenuhnya)
async function bootstrapCollections(user) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Bootstrap attempt ${attempt}/${MAX_RETRIES}`);
      
      // Periksa koneksi Firestore terlebih dahulu
      const isConnected = await checkFirestoreConnection();
      if (!isConnected) {
        throw new Error("Tidak dapat terhubung ke database");
      }

      // 1. Inisialisasi dokumen user (untuk semua role)
      const userRef = db.collection("users").doc(user.uid);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        const userData = {
          email: user.email || "",
          nama: user.email.split("@")[0] || "",
          role: ADMIN_UIDS.has(user.uid) ? "admin" : (KARYAWAN_UIDS.has(user.uid) ? "karyawan" : "unknown"),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await userRef.set(userData);
        console.log("User document created successfully");
      }

      // 2. Hanya admin yang dapat menginisialisasi meta dan settings
      if (ADMIN_UIDS.has(user.uid)) {
        try {
          // Meta document
          const metaRef = db.collection("_meta").doc("_srv");
          const metaDoc = await metaRef.get();
          
          if (!metaDoc.exists) {
            await metaRef.set({ 
              t: firebase.firestore.FieldValue.serverTimestamp(),
              initialized: true
            });
            console.log("Meta document created successfully");
          }

          // Settings document
          const settingsRef = db.collection("_settings").doc("today");
          const settingsDoc = await settingsRef.get();
          
          if (!settingsDoc.exists) {
            await settingsRef.set({
              mode: "auto", 
              date: ymd(new Date()),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log("Settings document created successfully");
          }
        } catch (adminError) {
          console.warn("Admin-specific initialization skipped:", adminError);
          // Lanjutkan tanpa gagal total jika inisialisasi admin-specific bermasalah
        }
      }
      
      console.log("Bootstrap successful on attempt", attempt);
      return true;
      
    } catch (error) {
      console.error(`Bootstrap attempt ${attempt} failed:`, error);
      
      if (attempt === MAX_RETRIES) {
        // Jangan throw error untuk karyawan yang tidak punya akses ke meta/settings
        if (error.code === 'permission-denied' && !ADMIN_UIDS.has(user.uid)) {
          console.log("Karyawan doesn't need admin collections, proceeding anyway");
          return true;
        }
        throw error;
      }
      
      // Tunggu sebelum retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt-1)));
    }
  }
}

// Auth routing untuk semua halaman (Diperbarui sepenuhnya)
auth.onAuthStateChanged(async (user) => {
  console.log("Auth state changed:", user ? user.uid : "No user");
  const path = location.pathname.toLowerCase();
  
  if (!user) {
    if (path.endsWith("karyawan.html") || path.endsWith("admin.html")) {
      console.log("Redirecting to login page");
      location.href = "index.html";
    }
    if (path.endsWith("index.html") || path.endsWith("/")) {
      bindLoginPage();
    }
    return;
  }

  console.log("User logged in:", user.uid);
  
  try {
    await bootstrapCollections(user);
  } catch (error) {
    console.error("Bootstrap error:", error);
    
    // Berikan error message yang lebih spesifik
    let errorMessage = "Gagal menginisialisasi sistem. Silakan refresh halaman.";
    
    if (error.code === 'permission-denied') {
      errorMessage = "Izin database ditolak. Hubungi administrator.";
    } else if (error.message.includes('Timeout')) {
      errorMessage = "Timeout terhubung ke database. Periksa koneksi internet.";
    } else if (error.message.includes('Tidak dapat terhubung')) {
      errorMessage = "Tidak dapat terhubung ke database. Periksa koneksi internet.";
    }
    
    toast(errorMessage, true);
    
    // Tambahkan delay sebelum redirect untuk memberi waktu membaca pesan error
    setTimeout(() => {
      auth.signOut();
      location.href = "index.html";
    }, 5000);
    return;
  }

  // Update server time live
  startServerClock("#serverTime");

  // Routing per halaman
  if (path.endsWith("index.html") || path.endsWith("/")) {
    redirectByRole(user.uid, "admin.html", "karyawan.html");
    return;
  }

  if (path.endsWith("karyawan.html")) {
    if (!guardPage(user.uid, "karyawan")) return;
    await ensureNotificationPermission();
    bindKaryawanPage(user);
  }

  if (path.endsWith("admin.html")) {
    if (!guardPage(user.uid, "admin")) return;
    await ensureNotificationPermission();
    bindAdminPage(user);
  }
});

// Halaman login
function bindLoginPage() {
  const loginBtn = $("#loginBtn");
  if (!loginBtn) return;
  
  loginBtn.onclick = async () => {
    const email = $("#email").value.trim();
    const pass = $("#password").value.trim();
    
    if (!email || !pass) { 
      toast("Isi email dan kata sandi.", true); 
      return; 
    }
    
    try {
      loginBtn.disabled = true;
      const originalText = loginBtn.innerHTML;
      loginBtn.innerHTML = '<span class="spinner"></span> Memeriksa...';
      
      await auth.signInWithEmailAndPassword(email, pass);
      toast("Login berhasil! Mengarahkan...");
    } catch (e) {
      console.error("Login error:", e);
      loginBtn.disabled = false;
      loginBtn.innerHTML = originalText;
      
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') {
        toast("Email atau kata sandi salah.", true);
      } else {
        toast("Gagal masuk. Periksa koneksi internet Anda.", true);
      }
    }
  };
}

// Jam server live
async function startServerClock(sel) {
  const el = $(sel);
  if (!el) return;
  
  const tick = async () => {
    try {
      const t = await getServerTime();
      el.textContent = `Waktu server: ${fmtDateTime(t)} WIB`;
    } catch {
      el.textContent = `Waktu server: tidak tersedia`;
    }
  };
  
  await tick();
  setInterval(tick, 10_000);
}

// Ambil lokasi
function getLocation(timeout = 8000) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("Geolokasi tidak didukung."));
    
    navigator.geolocation.getCurrentPosition(
      (pos) => res({ 
        lat: pos.coords.latitude, 
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      }),
      (err) => rej(err),
      { 
        enableHighAccuracy: true, 
        timeout, 
        maximumAge: 2_000 
      }
    );
  });
}

// Kamera
async function startCamera(videoEl) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: "user" }, 
      audio: false 
    });
    
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  } catch (e) {
    toast("Tidak bisa mengakses kamera.", true);
    throw e;
  }
}

function captureToCanvas(videoEl, canvasEl) {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  const MAXW = 720;
  const scale = Math.min(1, MAXW / w);
  
  canvasEl.width = Math.round(w * scale);
  canvasEl.height = Math.round(h * scale);
  
  const ctx = canvasEl.getContext("2d");
  ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
}

// Kompres gambar ke kualitas kecil (≤30KB) dan hapus metadata
async function canvasToCompressedBlob(canvas, targetKB = 30) {
  let quality = 0.6;
  let blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", quality));
  
  // Kompres hingga ≤30KB
  while (blob.size / 1024 > targetKB && quality > 0.1) {
    quality = Math.max(0.1, quality - 0.1);
    blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", quality));
  }
  
  // Hapus metadata EXIF dengan menggambar ulang
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
      const cleanCanvas = document.createElement('canvas');
      cleanCanvas.width = img.width;
      cleanCanvas.height = img.height;
      const ctx = cleanCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      cleanCanvas.toBlob(resolve, 'image/jpeg', quality);
    };
    img.src = URL.createObjectURL(blob);
  });
}

// Upload ke Cloudinary unsigned
async function uploadToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  
  const r = await fetch(url, { method: "POST", body: form });
  if (!r.ok) throw new Error("Upload Cloudinary gagal");
  
  const data = await r.json();
  return data.secure_url;
}

// Simpan presensi
async function savePresensi({ uid, nama, jenis, status, lat, lng, selfieUrl, serverDate }) {
  const ts = serverDate || new Date();
  const doc = {
    uid, 
    nama: nama || "", 
    jenis, 
    status,
    lat, 
    lng,
    selfieUrl: selfieUrl || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    localTime: fmtDateTime(ts),
    ymd: ymd(ts)
  };
  
  await db.collection("presensi").add(doc);
}

// Ambil riwayat singkat karyawan
function subscribeRiwayat(uid, cb, limit = 10) {
  return db.collection("presensi")
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      cb(arr);
    }, error => {
      console.error("Error fetching riwayat:", error);
      toast("Gagal memuat riwayat presensi.", true);
    });
}

// Notifikasi list untuk karyawan (Diperbarui sepenuhnya)
function subscribeNotifForKaryawan(uid, cb) {
  return db.collection("notifs")
    .where("targets", "array-contains", uid)
    .orderBy("createdAt", "desc")
    .limit(20)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => {
        const data = d.data();
        // Pastikan notifikasi untuk semua (all) juga ditampilkan
        if (data.targets && (data.targets.includes("all") || data.targets.includes(uid))) {
          arr.push({ id: d.id, ...data });
        }
      });
      cb(arr);
    }, error => {
      console.error("Error fetching notifications:", error);
      toast("Gagal memuat notifikasi.", true);
    });
}

// Cuti collection
async function ajukanCuti(uid, nama, jenis, tanggal, catatan) {
  const cutiRef = await db.collection("cuti").add({
    uid, 
    nama, 
    jenis, 
    tanggal, 
    catatan: catatan || "",
    status: "menunggu",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Buat notifikasi untuk admin
  await db.collection("notifs").add({
    type: "cuti",
    text: `${nama} mengajukan ${jenis} pada ${tanggal}`,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    from: uid,
    fromNama: nama,
    targets: Array.from(ADMIN_UIDS),
    cutiId: cutiRef.id,
    status: "menunggu"
  });
  
  return cutiRef.id;
}

// Admin list cuti
function subscribeCuti(cb) {
  return db.collection("cuti")
    .orderBy("createdAt", "desc")
    .limit(50)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      cb(arr);
    }, error => {
      console.error("Error fetching cuti:", error);
      toast("Gagal memuat data cuti.", true);
    });
}

async function setCutiStatus(id, status, adminUid, adminNama) {
  // Update status cuti
  await db.collection("cuti").doc(id).update({ 
    status,
    reviewedBy: adminUid,
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  
  // Dapatkan data cuti untuk notifikasi
  const cutiDoc = await db.collection("cuti").doc(id).get();
  const cutiData = cutiDoc.data();
  
  // Buat notifikasi untuk karyawan
  await db.collection("notifs").add({
    type: "cuti",
    text: `Permintaan cuti Anda ${status === 'disetujui' ? 'telah disetujui' : 'ditolak'} oleh admin`,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    from: adminUid,
    fromNama: adminNama,
    targets: [cutiData.uid],
    cutiId: id,
    status: status
  });
  
  // Jika disetujui, buat entri presensi otomatis
  if (status === "disetujui") {
    // Buat tanggal dari string tanggal cuti
    const cutiDate = new Date(cutiData.tanggal + 'T00:00:00');
    
    await db.collection("presensi").add({
      uid: cutiData.uid,
      nama: cutiData.nama,
      jenis: "cuti",
      status: cutiData.jenis, // izin, sakit, atau cuti
      lat: null,
      lng: null,
      selfieUrl: "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      localTime: fmtDateTime(cutiDate),
      ymd: cutiData.tanggal
    });
  }
}

// Pengumuman
async function kirimPengumuman(text, adminUid, adminNama) {
  await db.collection("notifs").add({
    type: "announce",
    text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    from: adminUid,
    fromNama: adminNama,
    targets: ["all"]
  });
  
  notify("Pengumuman terkirim ke semua karyawan.");
}

// Jadwal wajib
async function setHariMode(mode, dateStr, adminUid, adminNama) {
  await db.collection("_settings").doc("today").set({
    mode, 
    date: dateStr,
    updatedBy: adminUid,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  // Kirim notifikasi override ke semua karyawan
  let message = "";
  if (mode === "forceOn") {
    message = "Admin mengaktifkan presensi wajib hari ini";
  } else if (mode === "forceOff") {
    message = "Admin menonaktifkan presensi wajib hari ini";
  } else {
    message = "Admin mengembalikan pengaturan presensi ke mode otomatis";
  }
  
  await db.collection("notifs").add({
    type: "override",
    text: message,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    from: adminUid,
    fromNama: adminNama,
    targets: ["all"]
  });
}

// Profil simpan
async function saveProfile(uid, { nama, alamat, pfpUrl }) {
  const d = {};
  if (nama !== undefined) d.nama = nama;
  if (alamat !== undefined) d.alamat = alamat;
  if (pfpUrl !== undefined) d.pfp = pfpUrl;
  d.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  
  await db.collection("users").doc(uid).set(d, { merge: true });
}

// Ambil profil
async function getProfile(uid) {
  try {
    const snap = await db.collection("users").doc(uid).get();
    return snap.exists ? snap.data() : {};
  } catch (error) {
    console.error("Error getting profile:", error);
    toast("Gagal memuat profil.", true);
    return {};
  }
}

// Hapus notifikasi
async function deleteNotif(notifId) {
  await db.collection("notifs").doc(notifId).delete();
}

// Halaman Karyawan bindings
async function bindKaryawanPage(user) {
  const video = $("#cam");
  const canvas = $("#canvas");
  const preview = $("#preview");
  const jenisSel = $("#jenis");
  const statusText = $("#statusText");
  const statusChip = $("#statusChip");
  const locText = $("#locText");

  // Guard kamera
  let stream;
  try {
    stream = await startCamera(video);
  } catch (e) {
    console.error("Camera error:", e);
    toast("Tidak dapat mengakses kamera. Pastikan izin kamera diberikan.", true);
  }

  // Lokasi
  let coords = null;
  try {
    coords = await getLocation();
    locText.textContent = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
  } catch {
    locText.textContent = "Lokasi tidak aktif";
  }

  // Profil muat
  let profile = {};
  try {
    profile = await getProfile(user.uid);
    if (profile.pfp) $("#pfp").src = profile.pfp;
    if (profile.nama) $("#nama").value = profile.nama;
    if (profile.alamat) $("#alamat").value = profile.alamat;
  } catch (error) {
    console.error("Error loading profile:", error);
    toast("Gagal memuat profil.", true);
  }

  // Status window
  async function refreshStatus() {
    try {
      const serverNow = await getServerTime();
      const today = ymd(serverNow);
      const override = await getScheduleOverride(today);
      const isSunday = serverNow.getDay() === 0;
      const jenis = jenisSel.value;

      let wajib = true;
      if (override === "forceOn") wajib = true;
      else if (override === "forceOff") wajib = false;
      else wajib = !isSunday;

      if (!wajib) {
        statusText.textContent = "Hari ini tidak wajib presensi";
        statusChip.className = "status s-warn";
        return { allowed: false, reason: "not-required" };
      }

      const win = inWindow(serverNow, jenis, 30);
      if (!win.allowed) {
        statusText.textContent = "Di luar jam presensi";
        statusChip.className = "status s-bad";
        return { allowed: false, reason: "out-of-window" };
      } else {
        statusText.textContent = win.status === "tepat" ? "Tepat waktu" : "Terlambat";
        statusChip.className = "status " + (win.status === "tepat" ? "s-good" : "s-warn");
        return { allowed: true, status: win.status };
      }
    } catch (error) {
      console.error("Error refreshing status:", error);
      statusText.textContent = "Error memeriksa status";
      statusChip.className = "status s-bad";
      return { allowed: false, reason: "error" };
    }
  }

  // Refresh status on jenis change
  jenisSel.onchange = refreshStatus;
  setInterval(refreshStatus, 30_000);
  refreshStatus();

  // Tombol ambil gambar
  $("#captureBtn").onclick = () => {
    captureToCanvas(video, canvas);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    preview.src = dataUrl;
    preview.style.display = "block";
    $("#selfieGroup").style.display = "block";
  };

  // Tombol submit
  $("#submitBtn").onclick = async () => {
    if (!preview.src) { 
      toast("Ambil foto selfie terlebih dahulu.", true); 
      return; 
    }

    const jenis = jenisSel.value;
    const statusResult = await refreshStatus();
    
    if (!statusResult.allowed && statusResult.reason === "out-of-window") {
      toast("Tidak dapat presensi di luar jam yang ditentukan.", true);
      return;
    }

    try {
      $("#submitBtn").disabled = true;
      $("#submitBtn").innerHTML = '<span class="spinner"></span> Mengirim...';

      const serverNow = await getServerTime();
      const blob = await canvasToCompressedBlob(canvas, 30);
      const selfieUrl = await uploadToCloudinary(blob);
      const profile = await getProfile(user.uid);
      const nama = profile.nama || user.email.split("@")[0];

      await savePresensi({
        uid: user.uid,
        nama,
        jenis,
        status: statusResult.status || "tepat",
        lat: coords?.lat || null,
        lng: coords?.lng || null,
        selfieUrl,
        serverDate: serverNow
      });

      toast("Presensi berhasil dicatat!");
      preview.style.display = "none";
      $("#selfieGroup").style.display = "none";
    } catch (error) {
      console.error("Submit error:", error);
      toast("Gagal menyimpan presensi. Coba lagi.", true);
    } finally {
      $("#submitBtn").disabled = false;
      $("#submitBtn").innerHTML = "Kirim Presensi";
    }
  };

  // Riwayat
  const riwayatList = $("#riwayatList");
  subscribeRiwayat(user.uid, (arr) => {
    riwayatList.innerHTML = arr.map(p => `
      <div class="riwayat-item">
        <div class="riwayat-jenis">${p.jenis} <span class="status s-${p.status}">${p.status}</span></div>
        <div class="riwayat-time">${p.localTime}</div>
      </div>
    `).join("");
  }, 10);

  // Notifikasi
  const notifList = $("#notifList");
  const notifCount = $("#notifCount");
  subscribeNotifForKaryawan(user.uid, (arr) => {
    notifCount.textContent = arr.length;
    notifList.innerHTML = arr.map(n => `
      <div class="notif-item">
        <div class="notif-text">${n.text}</div>
        <div class="notif-time">${n.createdAt?.toDate ? fmtDateTime(n.createdAt.toDate()) : ""}</div>
      </div>
    `).join("");
  });

  // Cuti ajukan
  $("#cutiBtn").onclick = () => {
    $("#cutiModal").style.display = "block";
  };

  $("#cutiClose").onclick = () => {
    $("#cutiModal").style.display = "none";
  };

  $("#cutiSubmit").onclick = async () => {
    const jenis = $("#cutiJenis").value;
    const tanggal = $("#cutiTanggal").value;
    const catatan = $("#cutiCatatan").value;

    if (!jenis || !tanggal) { 
      toast("Isi jenis dan tanggal cuti.", true); 
      return; 
    }

    try {
      $("#cutiSubmit").disabled = true;
      const profile = await getProfile(user.uid);
      const nama = profile.nama || user.email.split("@")[0];
      
      await ajukanCuti(user.uid, nama, jenis, tanggal, catatan);
      toast("Pengajuan cuti terkirim. Menunggu persetujuan admin.");
      $("#cutiModal").style.display = "none";
    } catch (error) {
      console.error("Cuti error:", error);
      toast("Gagal mengajukan cuti.", true);
    } finally {
      $("#cutiSubmit").disabled = false;
    }
  };

  // Profil simpan
  $("#saveProfileBtn").onclick = async () => {
    const nama = $("#nama").value.trim();
    const alamat = $("#alamat").value.trim();

    if (!nama) { 
      toast("Nama wajib diisi.", true); 
      return; 
    }

    try {
      $("#saveProfileBtn").disabled = true;
      await saveProfile(user.uid, { nama, alamat });
      toast("Profil tersimpan.");
    } catch (error) {
      console.error("Profile save error:", error);
      toast("Gagal menyimpan profil.", true);
    } finally {
      $("#saveProfileBtn").disabled = false;
    }
  };

  // PFP upload
  $("#pfpInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("Hanya file gambar yang diizinkan.", true);
      return;
    }

    try {
      const url = await uploadToCloudinary(file);
      await saveProfile(user.uid, { pfpUrl: url });
      $("#pfp").src = url;
      toast("Foto profil berhasil diubah.");
    } catch (error) {
      console.error("PFP upload error:", error);
      toast("Gagal mengubah foto profil.", true);
    }
  };
}

// Halaman Admin bindings
async function bindAdminPage(user) {
  // Server time
  startServerClock("#serverTime");

  // Profil muat
  let profile = {};
  try {
    profile = await getProfile(user.uid);
    if (profile.nama) $("#adminNama").textContent = profile.nama;
  } catch (error) {
    console.error("Error loading admin profile:", error);
    toast("Gagal memuat profil.", true);
  }

  // Tab navigation
  $$(".tab").forEach(tab => {
    tab.onclick = () => {
      $$(".tab").forEach(t => t.classList.remove("active"));
      $$(".tab-content").forEach(t => t.style.display = "none");
      
      tab.classList.add("active");
      $(`#${tab.dataset.tab}`).style.display = "block";
    };
  });

  // Tab default
  $("#tab-presensi").click();

  // Presensi riwayat (Diperbarui dengan filter tanggal default hari ini)
  const presensiList = $("#presensiList");
  let presensiUnsub = null;
  let currentLimit = 20;
  
  // Fungsi untuk memuat riwayat presensi dengan filter
  function loadPresensi(limit = 20, dateFilter = null) {
    if (presensiUnsub) presensiUnsub();
    
    let query = db.collection("presensi")
      .orderBy("createdAt", "desc");
    
    // Set filter default ke hari ini jika tidak ada filter
    if (!dateFilter) {
      const today = ymd(new Date());
      dateFilter = today;
      $("#filterDate").value = today;
    }
    
    query = query.where("ymd", "==", dateFilter);
    
    if (limit > 0) {
      query = query.limit(limit);
    }
    
    presensiUnsub = query.onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      
      presensiList.innerHTML = arr.map(p => `
        <div class="presensi-item">
          <div class="presensi-header">
            <div class="presensi-nama">${p.nama}</div>
            <div class="presensi-jenis">${p.jenis} <span class="status s-${p.status}">${p.status}</span></div>
          </div>
          <div class="presensi-details">
            <div>Waktu: ${p.localTime}</div>
            <div>Lokasi: ${p.lat ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : 'Tidak ada'}</div>
            ${p.selfieUrl ? `<div><a href="${p.selfieUrl}" target="_blank">Lihat Foto</a></div>` : ''}
          </div>
        </div>
      `).join("");
    }, error => {
      console.error("Error fetching presensi:", error);
      toast("Gagal memuat riwayat presensi.", true);
    });
  }
  
  // Set filter tanggal default ke hari ini
  $("#filterDate").value = ymd(new Date());
  
  // Event handler untuk filter tanggal
  $("#filterDate").onchange = (e) => {
    loadPresensi(currentLimit, e.target.value);
  };
  
  // Event handler untuk limit dropdown
  $("#limitSelect").onchange = (e) => {
    const limit = e.target.value === "all" ? 0 : parseInt(e.target.value);
    currentLimit = limit;
    loadPresensi(limit, $("#filterDate").value);
  };
  
  // Muat data awal
  loadPresensi(currentLimit, $("#filterDate").value);

  // Cuti list
  const cutiList = $("#cutiList");
  subscribeCuti((arr) => {
    cutiList.innerHTML = arr.map(c => `
      <div class="cuti-item">
        <div class="cuti-header">
          <div class="cuti-nama">${c.nama}</div>
          <div class="cuti-status ${c.status}">${c.status}</div>
        </div>
        <div class="cuti-details">
          <div>Jenis: ${c.jenis}</div>
          <div>Tanggal: ${c.tanggal}</div>
          ${c.catatan ? `<div>Catatan: ${c.catatan}</div>` : ''}
          <div>Diajukan: ${c.createdAt?.toDate ? fmtDateTime(c.createdAt.toDate()) : ""}</div>
        </div>
        ${c.status === "menunggu" ? `
          <div class="cuti-actions">
            <button class="btn-small btn-success" onclick="adminSetCutiStatus('${c.id}', 'disetujui')">Setujui</button>
            <button class="btn-small btn-danger" onclick="adminSetCutiStatus('${c.id}', 'ditolak')">Tolak</button>
          </div>
        ` : ''}
      </div>
    `).join("");
  });

  // Set cuti status
  window.adminSetCutiStatus = async (id, status) => {
    try {
      const profile = await getProfile(user.uid);
      const nama = profile.nama || user.email.split("@")[0];
      
      await setCutiStatus(id, status, user.uid, nama);
      toast(`Permintaan cuti ${status === 'disetujui' ? 'disetujui' : 'ditolak'}`);
    } catch (error) {
      console.error("Cuti status error:", error);
      toast("Gagal mengubah status cuti.", true);
    }
  };

  // Notifikasi
  const notifList = $("#adminNotifList");
  const notifCount = $("#adminNotifCount");
  let notifUnsub = null;
  
  function loadNotifs(limit = 20) {
    if (notifUnsub) notifUnsub();
    
    notifUnsub = db.collection("notifs")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .onSnapshot(snap => {
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        
        notifCount.textContent = arr.length;
        notifList.innerHTML = arr.map(n => `
          <div class="notif-item">
            <div class="notif-header">
              <div class="notif-type">${n.type}</div>
              <button class="btn-icon" onclick="adminDeleteNotif('${n.id}')">✕</button>
            </div>
            <div class="notif-text">${n.text}</div>
            <div class="notif-time">${n.createdAt?.toDate ? fmtDateTime(n.createdAt.toDate()) : ""}</div>
          </div>
        `).join("");
      }, error => {
        console.error("Error fetching notifs:", error);
        toast("Gagal memuat notifikasi.", true);
      });
  }
  
  // Load notifikasi awal
  loadNotifs(20);
  
  // Delete notifikasi
  window.adminDeleteNotif = async (id) => {
    try {
      await deleteNotif(id);
      toast("Notifikasi dihapus");
    } catch (error) {
      console.error("Delete notif error:", error);
      toast("Gagal menghapus notifikasi.", true);
    }
  };

  // Pengumuman kirim
  $("#pengumumanBtn").onclick = () => {
    $("#pengumumanModal").style.display = "block";
  };

  $("#pengumumanClose").onclick = () => {
    $("#pengumumanModal").style.display = "none";
  };

  $("#pengumumanSubmit").onclick = async () => {
    const text = $("#pengumumanText").value.trim();
    
    if (!text) { 
      toast("Isi teks pengumuman.", true); 
      return; 
    }

    try {
      $("#pengumumanSubmit").disabled = true;
      const profile = await getProfile(user.uid);
      const nama = profile.nama || user.email.split("@")[0];
      
      await kirimPengumuman(text, user.uid, nama);
      toast("Pengumuman terkirim ke semua karyawan.");
      $("#pengumumanModal").style.display = "none";
      $("#pengumumanText").value = "";
    } catch (error) {
      console.error("Pengumuman error:", error);
      toast("Gagal mengirim pengumuman.", true);
    } finally {
      $("#pengumumanSubmit").disabled = false;
    }
  };

  // Hari mode override
  $("#modeAuto").onclick = async () => {
    await setHariMode("auto", ymd(new Date()), user.uid, profile.nama || "Admin");
    toast("Mode diatur ke otomatis (sesuai hari)");
  };

  $("#modeOn").onclick = async () => {
    await setHariMode("forceOn", ymd(new Date()), user.uid, profile.nama || "Admin");
    toast("Presensi diwajibkan hari ini");
  };

  $("#modeOff").onclick = async () => {
    await setHariMode("forceOff", ymd(new Date()), user.uid, profile.nama || "Admin");
    toast("Presensi tidak diwajibkan hari ini");
  };

  // Logout
  $("#logoutBtn").onclick = () => {
    auth.signOut();
  };
}