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
    await docRef.set({ t: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
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

// Auto bootstrap koleksi & dokumen penting (Diperbarui)
async function bootstrapCollections(user) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Bootstrap attempt ${attempt}/${MAX_RETRIES}`);
      
      // Periksa koneksi Firestore terlebih dahulu
      const isConnected = await checkFirestoreConnection();
      if (!isConnected) {
        throw new Error("Tidak dapat terhubung ke database");
      }

      // users profile doc
      const up = db.collection("users").doc(user.uid);
      const userDoc = await up.get();
      
      if (!userDoc.exists) {
        await up.set({
          email: user.email || "",
          nama: user.email.split("@")[0] || "",
          role: ADMIN_UIDS.has(user.uid) ? "admin" : (KARYAWAN_UIDS.has(user.uid) ? "karyawan" : "unknown"),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      // Hanya admin yang dapat menginisialisasi meta dan settings
      if (ADMIN_UIDS.has(user.uid)) {
        // meta server tick - hanya update jika sudah ada
        const metaRef = db.collection("_meta").doc("_srv");
        const metaDoc = await metaRef.get();
        if (!metaDoc.exists) {
          await metaRef.set({ 
            t: firebase.firestore.FieldValue.serverTimestamp(),
            initialized: true
          });
        } else {
          await metaRef.set({ 
            t: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }

        // settings today default - hanya buat jika belum ada
        const todayDoc = db.collection("_settings").doc("today");
        const todayData = await todayDoc.get();
        
        if (!todayData.exists) {
          await todayDoc.set({
            mode: "auto", 
            date: ymd(new Date()),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      
      console.log("Bootstrap successful");
      return true;
      
    } catch (error) {
      console.error(`Bootstrap attempt ${attempt} failed:`, error);
      
      if (attempt === MAX_RETRIES) {
        throw error; // Throw error setelah semua retry gagal
      }
      
      // Tunggu sebelum retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
    }
  }
}

// Auth routing untuk semua halaman (Diperbarui error handling)
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
function subscribeRiwayat(uid, cb) {
  return db.collection("presensi")
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(10)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      cb(arr);
    }, error => {
      console.error("Error fetching riwayat:", error);
      toast("Gagal memuat riwayat presensi.", true);
    });
}

// Notifikasi list untuk karyawan
function subscribeNotifForKaryawan(uid, cb) {
  return db.collection("notifs")
    .where("targets", "array-contains-any", ["all", uid])
    .orderBy("createdAt", "desc")
    .limit(20)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
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
    await db.collection("presensi").add({
      uid: cutiData.uid,
      nama: cutiData.nama,
      jenis: "cuti",
      status: cutiData.jenis,
      lat: null,
      lng: null,
      selfieUrl: "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      localTime: fmtDateTime(new Date(cutiData.tanggal)),
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
        return { allowed: true, status: win.status, serverNow };
      }
    } catch (error) {
      console.error("Error refreshing status:", error);
      return { allowed: false, reason: "error" };
    }
  }

  let lastStatus = await refreshStatus();
  setInterval(async () => { lastStatus = await refreshStatus(); }, 30_000);

  // Snap
  $("#snapBtn").onclick = () => {
    captureToCanvas(video, canvas);
    canvas.style.display = "block";
    preview.style.display = "none";
    toast("Foto diambil. Anda bisa langsung upload.");
  };

  // Upload
  $("#uploadBtn").onclick = async () => {
    // Periksa status window lagi
    lastStatus = await refreshStatus();
    if (!lastStatus.allowed) {
      toast("Presensi ditolak: di luar jadwal atau tidak wajib.", true);
      return;
    }
    
    if (!coords) {
      toast("Lokasi belum aktif.", true);
      return;
    }
    
    // Pastikan ada gambar di canvas
    if (canvas.width === 0 || canvas.height === 0) {
      toast("Ambil selfie dulu.", true);
      return;
    }
    
    try {
      // Tampilkan loading
      const originalText = $("#uploadBtn").innerHTML;
      $("#uploadBtn").innerHTML = '<span class="spinner"></span> Mengupload...';
      $("#uploadBtn").disabled = true;
      
      const blob = await canvasToCompressedBlob(canvas, 30);
      const url = await uploadToCloudinary(blob);
      preview.src = url;
      preview.style.display = "block";
      
      // Simpan presensi
      const nama = ($("#nama")?.value || profile.nama || user.email.split("@")[0]).trim();
      const jenis = jenisSel.value;
      const status = lastStatus.status === "tepat" ? "tepat" : "terlambat";
      
      await savePresensi({
        uid: user.uid,
        nama,
        jenis,
        status,
        lat: coords.lat,
        lng: coords.lng,
        selfieUrl: url,
        serverDate: lastStatus.serverNow
      });
      
      toast("Presensi tersimpan.");
      notify(`Presensi ${jenis} tercatat (${status}).`);
    } catch (e) {
      console.error("Upload error:", e);
      toast("Gagal menyimpan presensi.", true);
    } finally {
      // Kembalikan tombol ke keadaan semula
      $("#uploadBtn").innerHTML = "Upload";
      $("#uploadBtn").disabled = false;
    }
  };

  // Riwayat singkat
  const unsubLog = subscribeRiwayat(user.uid, (items) => {
    const list = $("#logList");
    list.innerHTML = "";
    
    items.forEach(it => {
      const badge = it.status === "tepat" ? "s-good" : (it.status === "terlambat" ? "s-warn" : "s-bad");
      const el = document.createElement("div");
      el.className = "row";
      el.style.justifyContent = "space-between";
      el.innerHTML = `
        <div class="row" style="gap:8px">
          <span class="material-symbols-rounded">schedule</span>
          <b>${it.localTime}</b>
          <span>•</span>
          <span>${it.jenis}</span>
        </div>
        <span class="status ${badge}">${it.status}</span>
      `;
      list.appendChild(el);
    });
  });

  // Notifikasi dialog
  $("#notifBtn").onclick = () => $("#notifDlg").showModal();
  
  const unsubNotif = subscribeNotifForKaryawan(user.uid, (items) => {
    const list = $("#notifList");
    list.innerHTML = "";
    
    // Update badge count
    const unreadCount = items.filter(item => !item.read).length;
    const notifBadge = $("#notifBadge");
    
    if (unreadCount > 0) {
      notifBadge.textContent = unreadCount;
      notifBadge.style.display = "grid";
    } else {
      notifBadge.style.display = "none";
    }
    
    items.forEach(it => {
      const el = document.createElement("div");
      el.className = "notif-item";
      const sub = it.type === "announce" ? "Pengumuman" : 
                 it.type === "cuti" ? "Cuti" : "Info";
                 
      el.innerHTML = `
        <div class="notif-content">
          <div style="font-weight:700">${sub}</div>
          <div style="opacity:.8; margin-top:4px">${it.text || "(tanpa teks)"}</div>
          <div style="font-size:12px; opacity:.6; margin-top:4px">
            ${it.createdAt ? it.createdAt.toDate().toLocaleString() : ""}
          </div>
        </div>
        <div class="notif-actions">
          <button class="icon-btn delete-notif" data-id="${it.id}" title="Hapus notifikasi">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
      `;
      list.appendChild(el);
    });
    
    // Bind delete actions
    $$(".delete-notif").forEach(btn => {
      btn.onclick = async () => {
        const notifId = btn.dataset.id;
        await deleteNotif(notifId);
        toast("Notifikasi dihapus");
      };
    });
  });

  // Cuti FAB
  $("#cutiFab").onclick = () => $("#cutiDlg").showModal();
  
  $("#ajukanCutiBtn").onclick = async () => {
    const jenis = $("#cutiJenis").value;
    const tanggal = $("#cutiTanggal").value;
    const catatan = $("#cutiCatatan").value.trim();
    
    if (!tanggal) { 
      toast("Pilih tanggal cuti.", true); 
      return; 
    }
    
    try {
      // Tampilkan loading
      const originalText = $("#ajukanCutiBtn").innerHTML;
      $("#ajukanCutiBtn").innerHTML = '<span class="spinner"></span> Mengajukan...';
      $("#ajukanCutiBtn").disabled = true;
      
      const nama = ($("#nama")?.value || profile.nama || user.email.split("@")[0]).trim();
      await ajukanCuti(user.uid, nama, jenis, tanggal, catatan);
      
      toast("Permintaan cuti dikirim.");
      notify("Permintaan cuti terkirim.");
      $("#cutiDlg").close();
      
      // Reset form
      $("#cutiTanggal").value = "";
      $("#cutiCatatan").value = "";
    } catch (e) {
      console.error("Cuti error:", e);
      toast("Gagal mengajukan cuti.", true);
    } finally {
      // Kembalikan tombol ke keadaan semula
      $("#ajukanCutiBtn").innerHTML = "Ajukan";
      $("#ajukanCutiBtn").disabled = false;
    }
  };

  // Profil dialog
  $("#profileBtn").onclick = () => $("#profileDlg").showModal();
  
  $("#saveProfileBtn").onclick = async () => {
    try {
      // Tampilkan loading
      const originalText = $("#saveProfileBtn").innerHTML;
      $("#saveProfileBtn").innerHTML = '<span class="spinner"></span> Menyimpan...';
      $("#saveProfileBtn").disabled = true;
      
      let pfpUrl = profile.pfp;
      const file = $("#pfpFile").files?.[0];
      
      if (file) {
        // kompres
        const imgEl = document.createElement("img");
        imgEl.src = URL.createObjectURL(file);
        await new Promise(r => imgEl.onload = r);
        
        const c = document.createElement("canvas");
        const scale = Math.min(1, 512 / Math.max(imgEl.width, imgEl.height));
        c.width = Math.max(64, Math.round(imgEl.width * scale));
        c.height = Math.max(64, Math.round(imgEl.height * scale));
        
        const ctx = c.getContext("2d");
        ctx.drawImage(imgEl, 0, 0, c.width, c.height);
        
        const pfpBlob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.7));
        pfpUrl = await uploadToCloudinary(pfpBlob);
        $("#pfp").src = pfpUrl;
      }
      
      const nama = $("#nama").value.trim();
      const alamat = $("#alamat").value.trim();
      
      await saveProfile(user.uid, { nama, alamat, pfpUrl });
      profile = { ...profile, nama, alamat, pfp: pfpUrl };
      
      toast("Profil tersimpan.");
      notify("Profil berhasil diperbarui.");
    } catch (e) {
      console.error("Profile error:", e);
      toast("Gagal menyimpan profil.", true);
    } finally {
      // Kembalikan tombol ke keadaan semula
      $("#saveProfileBtn").innerHTML = "Simpan";
      $("#saveProfileBtn").disabled = false;
    }
  };
  
  $("#logoutBtn").onclick = async () => { 
    try {
      await auth.signOut(); 
      location.href = "index.html"; 
    } catch (e) {
      console.error("Logout error:", e);
      toast("Gagal logout.", true);
    }
  };

  // Bersihkan stream saat keluar
  window.addEventListener("beforeunload", () => {
    try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch {}
    unsubLog && unsubLog();
    unsubNotif && unsubNotif();
  });
}

// Halaman Admin bindings
function toCSV(rows, columns) {
  const esc = (v) => `"${(v ?? "").toString().replace(/"/g, '""')}"`;
  const header = columns.map(esc).join(",");
  const body = rows.map(r => columns.map(k => esc(r[k])).join(",")).join("\n");
  return header + "\n" + body;
}

function download(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = filename;
  a.click();
}

async function bindAdminPage(user) {
  // Profil muat
  let profile = {};
  try {
    profile = await getProfile(user.uid);
    if (profile.pfp) $("#pfp").src = profile.pfp;
    if (profile.nama) $("#nama").value = profile.nama;
    if (profile.alamat) $("#alamat").value = profile.alamat;
  } catch (error) {
    console.error("Error loading admin profile:", error);
    toast("Gagal memuat profil admin.", true);
  }

  // Dialogs
  $("#profileBtn").onclick = () => $("#profileDlg").showModal();
  
  $("#logoutBtn").onclick = async () => { 
    try {
      await auth.signOut(); 
      location.href = "index.html"; 
    } catch (e) {
      console.error("Logout error:", e);
      toast("Gagal logout.", true);
    }
  };

  // Simpan profil
  $("#saveProfileBtn").onclick = async () => {
    try {
      // Tampilkan loading
      const originalText = $("#saveProfileBtn").innerHTML;
      $("#saveProfileBtn").innerHTML = '<span class="spinner"></span> Menyimpan...';
      $("#saveProfileBtn").disabled = true;
      
      let pfpUrl = profile.pfp;
      const file = $("#pfpFile").files?.[0];
      
      if (file) {
        const imgEl = document.createElement("img");
        imgEl.src = URL.createObjectURL(file);
        await new Promise(r => imgEl.onload = r);
        
        const c = document.createElement("canvas");
        const scale = Math.min(1, 512 / Math.max(imgEl.width, imgEl.height));
        c.width = Math.max(64, Math.round(imgEl.width * scale));
        c.height = Math.max(64, Math.round(imgEl.height * scale));
        
        const ctx = c.getContext("2d");
        ctx.drawImage(imgEl, 0, 0, c.width, c.height);
        
        const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.7));
        pfpUrl = await uploadToCloudinary(blob);
        $("#pfp").src = pfpUrl;
      }
      
      const nama = $("#nama").value.trim();
      const alamat = $("#alamat").value.trim();
      
      await saveProfile(user.uid, { nama, alamat, pfpUrl });
      profile = { ...profile, nama, alamat, pfp: pfpUrl };
      
      toast("Profil admin tersimpan.");
      notify("Profil admin diperbarui.");
    } catch (e) {
      console.error("Profile error:", e);
      toast("Gagal menyimpan profil admin.", true);
    } finally {
      // Kembalikan tombol ke keadaan semula
      $("#saveProfileBtn").innerHTML = "Simpan";
      $("#saveProfileBtn").disabled = false;
    }
  };

  // Notifikasi (cuti)
  $("#notifBtn").onclick = () => $("#notifDlg").showModal();
  
  const cutiList = $("#cutiList");
  const unsubCuti = subscribeCuti((items) => {
    cutiList.innerHTML = "";
    
    // Update badge count
    const pendingCount = items.filter(item => item.status === "menunggu").length;
    const notifBadge = $("#notifBadge");
    
    if (pendingCount > 0) {
      notifBadge.textContent = pendingCount;
      notifBadge.style.display = "grid";
    } else {
      notifBadge.style.display = "none";
    }
    
    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "card";
      row.innerHTML = `
        <div class="row" style="justify-content:space-between">
          <div class="row">
            <span class="material-symbols-rounded">person</span><b>${it.nama || it.uid}</b>
            <span>•</span>
            <span>${it.jenis}</span>
            <span>•</span>
            <span>${it.tanggal}</span>
          </div>
          <div class="row">
            <span class="status ${it.status === 'menunggu' ? 's-warn' : (it.status === 'disetujui' ? 's-good' : 's-bad')}">${it.status}</span>
          </div>
        </div>
        ${it.status === "menunggu" ? `
        <div class="row" style="justify-content:flex-end; margin-top:8px">
          <button class="btn" data-act="approve" data-id="${it.id}"><span class="material-symbols-rounded">check</span> Setujui</button>
          <button class="btn" data-act="reject" data-id="${it.id}" style="background:#222"><span class="material-symbols-rounded">close</span> Tolak</button>
        </div>
        ` : ''}
        ${it.catatan ? `<div style="margin-top:8px; font-size:14px; opacity:.8">Keterangan: ${it.catatan}</div>` : ''}
      `;
      cutiList.appendChild(row);
    });
    
    // Bind actions
    $$("[data-act='approve']").forEach(b => {
      b.onclick = async () => {
        try {
          // Tampilkan loading
          const originalText = b.innerHTML;
          b.innerHTML = '<span class="spinner"></span>';
          b.disabled = true;
          
          await setCutiStatus(b.dataset.id, "disetujui", user.uid, profile.nama || "Admin");
          toast("Cuti disetujui.");
          notify("Ada cuti disetujui.");
        } catch (e) {
          console.error("Approve error:", e);
          toast("Gagal menyetujui cuti.", true);
        } finally {
          // Kembalikan tombol ke keadaan semula
          b.innerHTML = originalText;
          b.disabled = false;
        }
      };
    });
    
    $$("[data-act='reject']").forEach(b => {
      b.onclick = async () => {
        try {
          // Tampilkan loading
          const originalText = b.innerHTML;
          b.innerHTML = '<span class="spinner"></span>';
          b.disabled = true;
          
          await setCutiStatus(b.dataset.id, "ditolak", user.uid, profile.nama || "Admin");
          toast("Cuti ditolak.");
          notify("Ada cuti ditolak.");
        } catch (e) {
          console.error("Reject error:", e);
          toast("Gagal menolak cuti.", true);
        } finally {
          // Kembalikan tombol ke keadaan semula
          b.innerHTML = originalText;
          b.disabled = false;
        }
      };
    });
  });

  // Pengumuman
  $("#announceFab").onclick = async () => {
    const text = prompt("Tulis pengumuman:");
    if (!text) return;
    
    try {
      await kirimPengumuman(text, user.uid, profile.nama || "Admin");
      toast("Pengumuman terkirim.");
    } catch (e) {
      console.error("Announce error:", e);
      toast("Gagal mengirim pengumuman.", true);
    }
  };
  
  $("#sendAnnounce").onclick = async () => {
    const text = $("#announceText").value.trim();
    if (!text) { 
      toast("Tulis isi pengumuman.", true); 
      return; 
    }
    
    try {
      // Tampilkan loading
      const originalText = $("#sendAnnounce").innerHTML;
      $("#sendAnnounce").innerHTML = '<span class="spinner"></span> Mengirim...';
      $("#sendAnnounce").disabled = true;
      
      await kirimPengumuman(text, user.uid, profile.nama || "Admin");
      $("#announceText").value = "";
      toast("Pengumuman terkirim.");
    } catch (e) {
      console.error("Announce error:", e);
      toast("Gagal mengirim pengumuman.", true);
    } finally {
      // Kembalikan tombol ke keadaan semula
      $("#sendAnnounce").innerHTML = "Kirim";
      $("#sendAnnounce").disabled = false;
    }
  };

  // Jadwal wajib / tidak
  $("#saveSchedule").onclick = async () => {
    const mode = $("#wajibHari").value;
    const now = await getServerTime();
    
    try {
      // Tampilkan loading
      const originalText = $("#saveSchedule").innerHTML;
      $("#saveSchedule").innerHTML = '<span class="spinner"></span> Menyimpan...';
      $("#saveSchedule").disabled = true;
      
      await setHariMode(mode, ymd(now), user.uid, profile.nama || "Admin");
      toast("Pengaturan hari tersimpan.");
    } catch (e) {
      console.error("Schedule error:", e);
      toast("Gagal menyimpan pengaturan.", true);
    } finally {
      // Kembalikan tombol ke keadaan semula
      $("#saveSchedule").innerHTML = "Simpan";
      $("#saveSchedule").disabled = false;
    }
  };

  // Tabel presensi + filter + export CSV
  let lastData = [];
  
  async function loadPresensi() {
    try {
      let q = db.collection("presensi").orderBy("createdAt", "desc").limit(500);
      const nama = $("#fNama").value.trim().toLowerCase();
      const tanggal = $("#fTanggal").value;
      
      const snap = await q.get();
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      
      let filtered = arr;
      if (tanggal) filtered = filtered.filter(x => x.ymd === tanggal);
      if (nama) filtered = filtered.filter(x => (x.nama || "").toLowerCase().includes(nama));
      
      lastData = filtered;
      renderTable(filtered);
    } catch (e) {
      console.error("Load presensi error:", e);
      toast("Gagal memuat data presensi.", true);
    }
  }
  
  function renderTable(rows) {
    const tb = $("#tableBody");
    tb.innerHTML = "";
    
    rows.forEach(r => {
      const badge = r.status === "tepat" ? "s-good" : (r.status === "terlambat" ? "s-warn" : "s-bad");
      const tr = document.createElement("tr");
      
      tr.innerHTML = `
        <td>${r.localTime || ""}</td>
        <td>${r.nama || r.uid}</td>
        <td>${r.jenis}</td>
        <td><span class="status ${badge}">${r.status}</span></td>
        <td>${(r.lat?.toFixed?.(5) || r.lat || "")}, ${(r.lng?.toFixed?.(5) || r.lng || "")}</td>
        <td>${r.selfieUrl ? `<a href="${r.selfieUrl}" target="_blank">Lihat</a>` : "-"}</td>
      `;
      
      tb.appendChild(tr);
    });
  }
  
  $("#applyFilter").onclick = () => loadPresensi();
  
  $("#exportCsv").onclick = () => {
    if (!lastData.length) { 
      toast("Tidak ada data untuk diekspor.", true); 
      return; 
    }
    
    try {
      const cols = ["localTime", "nama", "jenis", "status", "lat", "lng", "selfieUrl", "uid", "ymd"];
      const csv = toCSV(lastData, cols);
      download(`presensi_${Date.now()}.csv`, csv);
      toast("Data berhasil diekspor.");
    } catch (e) {
      console.error("Export error:", e);
      toast("Gagal mengekspor data.", true);
    }
  };
  
  // Muat awal + refresh periodik ringan
  await loadPresensi();
  setInterval(loadPresensi, 20_000);

  // Create akun karyawan
  const secondApp = firebase.apps.length > 1 ? firebase.apps[1] : firebase.initializeApp(firebaseConfig, "second");
  const secondAuth = secondApp.auth();

  $("#createUserBtn").onclick = async () => {
    const email = $("#newEmail").value.trim();
    const pass = $("#newPass").value.trim();
    
    if (!email || !pass) { 
      toast("Isi email dan kata sandi.", true); 
      return; 
    }
    
    try {
      // Tampilkan loading
      const originalText = $("#createUserBtn").innerHTML;
      $("#createUserBtn").innerHTML = '<span class="spinner"></span> Membuat...';
      $("#createUserBtn").disabled = true;
      
      const cred = await secondAuth.createUserWithEmailAndPassword(email, pass);
      const uid = cred.user.uid;
      
      await db.collection("users").doc(uid).set({
        email, 
        role: "karyawan", 
        createdBy: user.uid, 
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      // Kembalikan secondAuth ke kosong signOut agar tidak mengganggu
      await secondAuth.signOut();
      
      toast("Akun karyawan dibuat.");
      notify("Akun karyawan baru telah dibuat.");
      
      // Reset form
      $("#newEmail").value = "";
      $("#newPass").value = "";
    } catch (e) {
      console.error("Create user error:", e);
      toast("Gagal membuat akun karyawan.", true);
    } finally {
      // Kembalikan tombol ke keadaan semula
      $("#createUserBtn").innerHTML = "Buat";
      $("#createUserBtn").disabled = false;
    }
  };

  // Bersih
  window.addEventListener("beforeunload", () => {
    unsubCuti && unsubCuti();
  });
}

// Tambahkan style untuk spinner
const style = document.createElement('style');
style.textContent = `
  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    border-top-color: #fff;
    animation: spin 1s ease-in-out infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);