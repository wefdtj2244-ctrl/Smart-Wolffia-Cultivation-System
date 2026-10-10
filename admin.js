/**
 * Wave Restaurant - Staff Dashboard Logic
 */

let staffUser = null;
let allOrders = [];
let allMenuItems = [];

// Elements
const navUserName = document.getElementById("nav-user-name");
const navUserAvatar = document.getElementById("nav-user-avatar");
const btnLogout = document.getElementById("btn-logout");

const sidebarTabs = document.querySelectorAll(".dashboard-menu-item");
const sections = document.querySelectorAll(".dashboard-section");

// Orders board lists
const listPending = document.getElementById("list-pending");
const listKitchen = document.getElementById("list-kitchen");
const listReady = document.getElementById("list-ready");

// Order board counts
const countPending = document.getElementById("count-pending");
const countKitchen = document.getElementById("count-kitchen");
const countReady = document.getElementById("count-ready");

// Orders stats counters
const statsActiveCount = document.getElementById("stats-active-count");
const statsReadyCount = document.getElementById("stats-ready-count");
const statsRevenueToday = document.getElementById("stats-revenue-today");

// Menu Management elements
const menuTableBody = document.getElementById("menu-table-body");
const btnAddMenuModal = document.getElementById("btn-add-menu-modal");
const menuModal = document.getElementById("menu-modal");
const btnCloseModal = document.getElementById("btn-close-modal");
const menuItemForm = document.getElementById("menu-item-form");
const modalTitle = document.getElementById("modal-title");

// Stats elements
const statsTotalCompleted = document.getElementById("stats-total-completed");
const statsTotalCancelled = document.getElementById("stats-total-cancelled");
const statsNetRevenue = document.getElementById("stats-net-revenue");
const statsOrdersBody = document.getElementById("stats-orders-body");

const toastContainer = document.getElementById("toast-container");

// Initialize page
document.addEventListener("DOMContentLoaded", () => {
  // 1. Session check
  const loggedInStaff = sessionStorage.getItem("wave_logged_in_staff");
  if (!loggedInStaff) {
    window.location.href = "login.html";
    return;
  }
  staffUser = JSON.parse(loggedInStaff);

  // 2. Render user info
  if (navUserName) navUserName.textContent = `${staffUser.name} (${staffUser.role})`;
  if (navUserAvatar && staffUser.name) navUserAvatar.textContent = staffUser.name.charAt(0);

  // 3. Tab switching listeners
  sidebarTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      sidebarTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const targetView = tab.getAttribute("data-view");
      sections.forEach(sec => {
        if (sec.id === `view-${targetView}`) {
          sec.style.display = "block";
        } else {
          sec.style.display = "none";
        }
      });

      // Reload appropriate data
      if (targetView === "orders") loadOrders();
      if (targetView === "menu") loadMenuTable();
      if (targetView === "stats") loadStatistics();
    });
  });

  // 4. Logout handler
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      sessionStorage.removeItem("wave_logged_in_staff");
      window.location.href = "login.html";
    });
  }

  // 5. Menu Form Modal event listeners
  if (btnAddMenuModal) {
    btnAddMenuModal.addEventListener("click", () => openMenuModal());
  }
  if (btnCloseModal) {
    btnCloseModal.addEventListener("click", () => closeMenuModal());
  }
  if (menuItemForm) {
    menuItemForm.addEventListener("submit", handleMenuFormSubmit);
  }

  // 6. Initial data load
  loadOrders();
  loadMenuTable();

  // 7. Polling setup: update orders board dynamically every 6 seconds
  setInterval(() => {
    const activeTab = document.querySelector(".dashboard-menu-item.active");
    if (activeTab && activeTab.getAttribute("data-view") === "orders") {
      loadOrders(true); // silent update
    }
  }, 6000);
});

// --- ORDERS BOARD LOGIC ---
async function loadOrders(isSilent = false) {
  try {
    allOrders = await window.WaveDB.getOrders();
    renderOrdersBoard();
  } catch (err) {
    console.error("Dashboard failed to retrieve orders:", err);
    if (!isSilent) showToast("ไม่สามารถเรียกข้อมูลคำสั่งซื้อได้", "error");
  }
}

function renderOrdersBoard() {
  if (!listPending || !listKitchen || !listReady) return;

  // Clear boards
  listPending.innerHTML = "";
  listKitchen.innerHTML = "";
  listReady.innerHTML = "";

  let pendingCountVal = 0;
  let kitchenCountVal = 0;
  let readyCountVal = 0;

  let activeCount = 0;
  let readyCount = 0;
  let revenueToday = 0;

  // Process today's date context (simple comparison)
  const todayStr = new Date().toDateString();

  allOrders.forEach(order => {
    const orderDate = new Date(order.created_at);
    const timeStr = orderDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    
    // Accumulate total revenue for completed orders placed today
    if (order.status === 'completed') {
      const orderDateStr = orderDate.toDateString();
      if (orderDateStr === todayStr) {
        revenueToday += order.total;
      }
    }

    // Build order card component
    const card = document.createElement("div");
    card.className = "dashboard-order-card";
    
    // Generate order item description lines
    let itemsHtml = "";
    order.items.forEach(it => {
      itemsHtml += `<li>• ${it.name} <strong style="color:var(--primary)">x ${it.qty}</strong></li>`;
    });

    const isPending = order.status === 'pending';
    const isPreparing = order.status === 'preparing';
    const isReady = order.status === 'ready';

    if (isPending || isPreparing || isReady) {
      activeCount++;
      if (isReady) readyCount++;
    }

    card.innerHTML = `
      <div class="order-card-header">
        <span class="order-card-id"><i class="fa-solid fa-hashtag"></i> ${order.id}</span>
        <span class="order-card-time">${timeStr}</span>
      </div>
      <div class="order-card-meta">
        <span>👤 ${order.customerName}</span>
        <span style="color:var(--primary)">📍 โต๊ะ ${order.tableNo}</span>
      </div>
      <ul class="order-items-summary">
        ${itemsHtml}
      </ul>
      ${order.notes ? `
        <div style="font-size:0.78rem; background-color:var(--bg-tertiary); padding:0.4rem; border-radius:var(--radius-sm); color:var(--text-muted)">
          <strong>โน้ต:</strong> ${order.notes}
        </div>
      ` : ''}
      <div style="font-weight:700; font-size:0.92rem; display:flex; justify-content:space-between; margin-top:0.2rem">
        <span>ยอดชำระ:</span>
        <span>฿${order.total}</span>
      </div>
      <div class="order-card-actions">
        ${renderCardActions(order)}
      </div>
    `;

    // Append to corresponding board column
    if (isPending) {
      listPending.appendChild(card);
      pendingCountVal++;
    } else if (isPreparing) {
      listKitchen.appendChild(card);
      kitchenCountVal++;
    } else if (isReady) {
      listReady.appendChild(card);
      readyCountVal++;
    }
  });

  // Update DOM counts & summary badges
  if (countPending) countPending.textContent = pendingCountVal;
  if (countKitchen) countKitchen.textContent = kitchenCountVal;
  if (countReady) countReady.textContent = readyCountVal;

  if (statsActiveCount) statsActiveCount.textContent = activeCount;
  if (statsReadyCount) statsReadyCount.textContent = readyCount;
  if (statsRevenueToday) statsRevenueToday.textContent = `฿${revenueToday.toLocaleString()}`;

  // Attach button triggers for state changes
  bindOrderActionTriggers();
}

function renderCardActions(order) {
  const receiptUrl = `receipt.html?id=${order.id}`;
  
  if (order.status === 'pending') {
    return `
      <button class="action-btn-small primary btn-action-status" data-id="${order.id}" data-status="preparing"><i class="fa-solid fa-fire"></i> เริ่มปรุง</button>
      <button class="action-btn-small btn-action-status" data-id="${order.id}" data-status="cancelled" style="color:var(--status-cancelled)"><i class="fa-solid fa-xmark"></i> ยกเลิก</button>
    `;
  }
  if (order.status === 'preparing') {
    return `
      <button class="action-btn-small success btn-action-status" data-id="${order.id}" data-status="ready"><i class="fa-solid fa-bell"></i> เสร็จแล้ว</button>
      <a href="${receiptUrl}" target="_blank" class="action-btn-small"><i class="fa-solid fa-print"></i> ใบเสร็จ</a>
    `;
  }
  if (order.status === 'ready') {
    return `
      <button class="action-btn-small primary btn-action-status" data-id="${order.id}" data-status="completed" style="background-color:var(--status-completed); border-color:var(--status-completed)"><i class="fa-solid fa-circle-check"></i> เสิร์ฟสำเร็จ</button>
      <a href="${receiptUrl}" target="_blank" class="action-btn-small"><i class="fa-solid fa-print"></i> ใบเสร็จ</a>
    `;
  }
  return `<a href="${receiptUrl}" target="_blank" class="action-btn-small" style="flex:1"><i class="fa-solid fa-print"></i> พิมพ์ใบเสร็จ</a>`;
}

function bindOrderActionTriggers() {
  document.querySelectorAll(".btn-action-status").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const nextStatus = btn.getAttribute("data-status");

      try {
        await window.WaveDB.updateOrderStatus(id, nextStatus);
        
        let statusMsg = "";
        if (nextStatus === "preparing") statusMsg = "กำลังเตรียมปรุงอาหาร";
        if (nextStatus === "ready") statusMsg = "ปรุงอาหารเสร็จแล้ว รอเสิร์ฟ";
        if (nextStatus === "completed") statusMsg = "ออเดอร์ดำเนินการเสร็จสิ้นเรียบร้อย";
        if (nextStatus === "cancelled") statusMsg = "ยกเลิกรายการออเดอร์แล้ว";

        showToast(statusMsg, nextStatus === "cancelled" ? "error" : "success");
        loadOrders(); // reload
      } catch (err) {
        console.error("Failed to update status:", err);
        showToast("ไม่สามารถอัปเดตสถานะคำสั่งซื้อได้", "error");
      }
    });
  });
}

// --- MENU MANAGEMENT LOGIC ---
async function loadMenuTable() {
  try {
    allMenuItems = await window.WaveDB.getMenu();
    renderMenuTable();
  } catch (err) {
    console.error("Dashboard failed to retrieve menu items:", err);
    showToast("เกิดข้อผิดพลาดในการโหลดเมนูอาหาร", "error");
  }
}

function renderMenuTable() {
  if (!menuTableBody) return;
  menuTableBody.innerHTML = "";

  if (allMenuItems.length === 0) {
    menuTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:3rem; color:var(--text-muted)">ยังไม่มีรายการอาหารในระบบ</td>
      </tr>
    `;
    return;
  }

  allMenuItems.forEach(item => {
    const tr = document.createElement("tr");
    
    // Setup status badge style
    const isAvail = item.available !== false;
    const statusText = isAvail ? "กำลังขาย" : "ปิดการขาย";
    const statusStyle = isAvail 
      ? 'background-color:var(--status-ready-light); color:var(--status-ready)' 
      : 'background-color:var(--status-cancelled-light); color:var(--status-cancelled)';

    tr.innerHTML = `
      <td><img src="${item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100'}" class="table-menu-img" alt="${item.name}"></td>
      <td>
        <strong style="font-size:0.95rem">${item.name}</strong>
        ${item.description ? `<p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.15rem">${item.description}</p>` : ''}
      </td>
      <td><span style="font-size:0.85rem; font-weight:600">${getCategoryName(item.category)}</span></td>
      <td><strong style="color:var(--primary)">฿${item.price}</strong></td>
      <td>
        <span style="font-size:0.8rem; font-weight:700; padding:0.2rem 0.6rem; border-radius:var(--radius-full); ${statusStyle}">
          ${statusText}
        </span>
      </td>
      <td style="text-align:right">
        <button class="action-btn-icon edit btn-edit-menu" data-id="${item.id}" title="แก้ไขเมนู"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="action-btn-icon edit btn-toggle-avail" data-id="${item.id}" title="${isAvail ? 'ปิดการขาย' : 'เปิดการขาย'}">
          <i class="${isAvail ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'}" style="color:var(--text-muted)"></i>
        </button>
        <button class="action-btn-icon delete btn-delete-menu" data-id="${item.id}" title="ลบเมนู"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;

    menuTableBody.appendChild(tr);
  });

  // Bind edit/delete/avail triggers
  bindMenuActionTriggers();
}

function bindMenuActionTriggers() {
  // Toggle availability
  document.querySelectorAll(".btn-toggle-avail").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const item = allMenuItems.find(m => m.id === id);
      if (!item) return;

      item.available = item.available === false ? true : false;
      try {
        await window.WaveDB.saveMenuItem(item);
        showToast(`อัปเดตสถานะของ ${item.name} เรียบร้อย`, "success");
        loadMenuTable();
      } catch (err) {
        console.error(err);
        showToast("ไม่สามารถอัปเดตสถานะสินค้าได้", "error");
      }
    });
  });

  // Edit menu item
  document.querySelectorAll(".btn-edit-menu").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const item = allMenuItems.find(m => m.id === id);
      if (item) {
        openMenuModal(item);
      }
    });
  });

  // Delete menu item
  document.querySelectorAll(".btn-delete-menu").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const item = allMenuItems.find(m => m.id === id);
      if (!item) return;

      if (confirm(`คุณต้องการลบเมนูอาหาร "${item.name}" หรือไม่?`)) {
        try {
          await window.WaveDB.deleteMenuItem(id);
          showToast("ลบเมนูอาหารออกจากระบบแล้ว", "success");
          loadMenuTable();
        } catch (err) {
          console.error(err);
          showToast("ไม่สามารถลบรายการอาหารได้", "error");
        }
      }
    });
  });
}

function getCategoryName(category) {
  switch(category) {
    case "food": return "อาหารจานหลัก";
    case "drinks": return "เครื่องดื่ม";
    case "desserts": return "ของหวาน";
    default: return "ทั่วไป";
  }
}

// Modal control
function openMenuModal(item = null) {
  if (!menuModal) return;
  menuModal.style.display = "flex";

  if (item) {
    modalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> แก้ไขเมนูอาหาร`;
    document.getElementById("menu-id").value = item.id;
    document.getElementById("menu-name").value = item.name;
    document.getElementById("menu-price").value = item.price;
    document.getElementById("menu-category").value = item.category;
    document.getElementById("menu-description").value = item.description || "";
    document.getElementById("menu-image").value = item.image || "";
  } else {
    modalTitle.innerHTML = `<i class="fa-solid fa-plus"></i> เพิ่มเมนูอาหารใหม่`;
    menuItemForm.reset();
    document.getElementById("menu-id").value = "";
  }
}

function closeMenuModal() {
  if (menuModal) menuModal.style.display = "none";
}

async function handleMenuFormSubmit() {
  const id = document.getElementById("menu-id").value;
  const name = document.getElementById("menu-name").value.trim();
  const price = parseInt(document.getElementById("menu-price").value);
  const category = document.getElementById("menu-category").value;
  const description = document.getElementById("menu-description").value.trim();
  const image = document.getElementById("menu-image").value.trim();

  const menuItemPayload = {
    name,
    price,
    category,
    description,
    image: image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400",
    available: true
  };

  if (id) {
    menuItemPayload.id = id;
    // Retain previous available state
    const original = allMenuItems.find(m => m.id === id);
    if (original) menuItemPayload.available = original.available;
  }

  try {
    await window.WaveDB.saveMenuItem(menuItemPayload);
    showToast(id ? "แก้ไขเมนูอาหารเรียบร้อย" : "เพิ่มเมนูอาหารใหม่เรียบร้อย", "success");
    closeMenuModal();
    loadMenuTable();
  } catch (err) {
    console.error(err);
    showToast("เกิดข้อผิดพลาดในการบันทึกข้อมูลเมนู", "error");
  }
}

// --- STATISTICS LOGIC ---
async function loadStatistics() {
  try {
    allOrders = await window.WaveDB.getOrders();
    renderStatistics();
  } catch (err) {
    console.error(err);
  }
}

function renderStatistics() {
  if (!statsOrdersBody) return;
  statsOrdersBody.innerHTML = "";

  let completedCount = 0;
  let cancelledCount = 0;
  let netRevenueVal = 0;

  allOrders.forEach(order => {
    // Accumulate counts
    if (order.status === 'completed') {
      completedCount++;
      netRevenueVal += order.total;
    } else if (order.status === 'cancelled') {
      cancelledCount++;
    }

    const orderDate = new Date(order.created_at);
    const dateStr = orderDate.toLocaleDateString('th-TH') + ' ' + orderDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';

    let statusStyle = "";
    let statusText = order.status;
    switch(order.status) {
      case "pending": statusStyle = 'background-color:var(--status-pending-light); color:var(--status-pending)'; statusText = "รอยืนยัน"; break;
      case "preparing": statusStyle = 'background-color:var(--status-preparing-light); color:var(--status-preparing)'; statusText = "กำลังปรุง"; break;
      case "ready": statusStyle = 'background-color:var(--status-ready-light); color:var(--status-ready)'; statusText = "รอเสิร์ฟ"; break;
      case "completed": statusStyle = 'background-color:var(--status-completed-light); color:var(--status-completed)'; statusText = "สำเร็จ"; break;
      case "cancelled": statusStyle = 'background-color:var(--status-cancelled-light); color:var(--status-cancelled)'; statusText = "ยกเลิก"; break;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${order.id}</strong></td>
      <td>${order.customerName}</td>
      <td><span style="color:var(--primary); font-weight:700">โต๊ะ ${order.tableNo}</span></td>
      <td><span style="font-size:0.85rem; color:var(--text-muted)">${dateStr}</span></td>
      <td><strong>฿${order.total}</strong></td>
      <td><span style="font-size:0.8rem; font-weight:700; padding:0.25rem 0.6rem; border-radius:var(--radius-full); ${statusStyle}">${statusText}</span></td>
      <td style="text-align:right">
        <a href="receipt.html?id=${order.id}" target="_blank" class="action-btn-icon edit" title="พิมพ์ใบเสร็จ"><i class="fa-solid fa-print"></i></a>
      </td>
    `;
    statsOrdersBody.appendChild(tr);
  });

  // Set counters
  if (statsTotalCompleted) statsTotalCompleted.textContent = completedCount;
  if (statsTotalCancelled) statsTotalCancelled.textContent = cancelledCount;
  if (statsNetRevenue) statsNetRevenue.textContent = `฿${netRevenueVal.toLocaleString()}`;
}

// Custom Toast Alerts
function showToast(message, type = "success") {
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  const icon = type === "success" 
    ? '<i class="fa-solid fa-circle-check" style="color: var(--status-ready)"></i>' 
    : '<i class="fa-solid fa-circle-exclamation" style="color: var(--status-cancelled)"></i>';

  toast.innerHTML = `
    ${icon}
    <span>${message}</span>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideInLeft 0.3s reverse forwards";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
