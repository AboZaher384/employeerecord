const API_URL = "https://script.google.com/macros/s/AKfycbxz8lOyTgnepa305e5DAtb_-zvxfbcj6fiUySe-ZtE4G5NR7c4_v3qTdEmqHqiEzncF/exec"
// ═══════════════════════════════════════
// SHEETS API
// ═══════════════════════════════════════
async function apiPost(data) {
  const token = localStorage.getItem('auth_token');
  if (token && !data.token) data.token = token;
  const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(data) });
  return await res.json();
}

// نسخ احتياطي للسحابة بدون انتظار (fire and forget)
function syncToCloud(action, record) {
  apiPost({ action, ...record }).catch(() => {});
}

// ═══════════════════════════════════════
// LOCAL STORAGE (مرتبط بـ user_id)
// ═══════════════════════════════════════
function uid() { return localStorage.getItem('auth_uid') || 'guest'; }
function localKey(table) { return `${table}_${uid()}`; }
function localGet(table) {
  try { return JSON.parse(localStorage.getItem(localKey(table)) || '[]'); }
  catch(e) { return []; }
}
function localSet(table, data) {
  localStorage.setItem(localKey(table), JSON.stringify(data));
}

// ═══════════════════════════════════════
// ATTENDANCE — محلي + سحابة
// ═══════════════════════════════════════
const Attendance = {
  getAll() { return localGet('attendance'); },

  add(record) {
    // 🛠️ تنظيف التاريخ من الوقت والأصفار قبل الحفظ والإرسال
    if (record && record.date) {
      record.date = record.date.split('T')[0];
    }
    
    const d = localGet('attendance');
    d.push(record);
    localSet('attendance', d);
    // نسخة على السحابة
    syncToCloud('addAttendance', record);
  },

  update(index, record) {
    const d = localGet('attendance');
    const old = { ...d[index] };
    
    // 🛠️ تنظيف التاريخ الجديد والقديم لضمان عدم إرسال أصفار الوقت للسيرفر
    if (record && record.date) record.date = record.date.split('T')[0];
    if (old && old.date) old.date = old.date.split('T')[0];
    
    d[index] = record;
    localSet('attendance', d);
    
    // تحديث السحابة
    apiPost({
      action: 'updateAttendance',
      emp_id: record.emp_id,
      old_date: old.date,
      old_checkin: old.checkin,
      date: record.date,
      checkin: record.checkin,
      checkout: record.checkout
    }).catch(() => {});
  },

  forEmployee(empId) {
    return localGet('attendance').filter(r => String(r.emp_id) === String(empId));
  },

  // مزامنة كاملة من السحابة للجهاز (عند تسجيل الدخول)
  async syncFromCloud() {
    try {
      const res = await apiPost({ action: 'getAttendance' });
      if (res.success && res.data && res.data.length > 0) {
        // 🛠️ تنظيف البيانات القادمة من السحاب أيضاً لضمان نظافة واجهتك بالكامل
        const cleanedData = res.data.map(item => {
          if (item.date) item.date = item.date.split('T')[0];
          return item;
        });
        localSet('attendance', cleanedData);
      }
    } catch(e) {}
  }
};

// ═══════════════════════════════════════
// ADVANCES — محلي + سحابة
// ═══════════════════════════════════════
const Advances = {
  getAll() { return localGet('advances'); },

  add(record) {
    // 🛠️ تنظيف تاريخ السلفة من الوقت إن وجد
    if (record && record.date) {
      record.date = record.date.split('T')[0];
    }
    
    const d = localGet('advances');
    d.push(record);
    localSet('advances', d);
    syncToCloud('addAdvance', record);
  },

  forEmployee(empId) {
    return localGet('advances').filter(a => String(a.emp_id) === String(empId));
  },

  async syncFromCloud() {
    try {
      const res = await apiPost({ action: 'getAdvances' });
      if (res.success && res.data && res.data.length > 0) {
        // 🛠️ تنظيف تواريخ السلف القادمة من السحابة
        const cleanedData = res.data.map(item => {
          if (item.date) item.date = item.date.split('T')[0];
          return item;
        });
        localSet('advances', cleanedData);
      }
    } catch(e) {}
  }
};

// ═══════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════
function showAlert(msg, type, containerId = 'alert-box') {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  setTimeout(() => box.innerHTML = '', 4000);
}

function loading(btn, state) {
  if (state) { btn.disabled = true; btn._orig = btn.innerHTML; btn.innerHTML = '⏳ جارٍ التحميل...'; }
  else { btn.disabled = false; btn.innerHTML = btn._orig; }
}

// ═══════════════════════════════════════
// AUTH
// ═══════════════════════════════════════
async function requireAuth() {
  const token = localStorage.getItem('auth_token');
  if (!token) { window.location.href = 'login.html'; return null; }
  try {
    const res = await apiPost({ action: 'verifyToken', token });
    if (!res.success) { logout(); return null; }
    localStorage.setItem('auth_uid', String(res.data.id));
    // مزامنة البيانات من السحابة للجهاز عند كل دخول
    Attendance.syncFromCloud();
    Advances.syncFromCloud();
    return res.data;
  } catch(e) {
    // إذا ما في نت، اشتغل من الجهاز
    const name = localStorage.getItem('auth_name');
    if (name) return { name };
    logout(); return null;
  }
}

function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_name');
  localStorage.removeItem('auth_email');
  localStorage.removeItem('auth_uid');
  window.location.href = 'login.html';
}