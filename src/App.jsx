import React, { useState, useEffect, useRef } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp, remove, get, off } from "firebase/database";
import { 
  Trash2, Wallet, Users, CheckCircle2, Settings, Edit2, X, 
  ChevronDown, ChevronUp, Check, Loader2, LogOut, Home, Plus, 
  ArrowRight, AlertCircle, RotateCcw, Copy, Send
} from 'lucide-react';

// ==========================================
// 系統設定
// ==========================================
const LIFF_ID = "2009134573-7SuphV8b"; 
const APP_VERSION = "v1_db_reset_2024_new"; 

const firebaseConfig = {
  apiKey: "AIzaSyBBiEaI_-oH34YLpB4xmlJljyOtxz-yty4",
  authDomain: "roomie-task.firebaseapp.com",
  databaseURL: "https://roomie-task-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "roomie-task",
  storageBucket: "roomie-task.firebasestorage.app",
  messagingSenderId: "233849609695",
  appId: "1:233849609695:web:0c76a4b9b40070cf22386a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const getTodayString = () => new Date().toISOString().split('T')[0];
const addDays = (dateStr, days) => {
  const result = new Date(dateStr);
  result.setDate(result.getDate() + parseInt(days));
  return result.toISOString().split('T')[0];
};
const generateId = () => Math.random().toString(36).substr(2, 9);

const getSavedGroups = () => {
  try { 
    const savedVer = localStorage.getItem('app_version');
    if (savedVer !== APP_VERSION) {
        localStorage.clear(); 
        localStorage.setItem('app_version', APP_VERSION); 
        return [];
    }
    return JSON.parse(localStorage.getItem('roomie_groups') || '[]'); 
  } catch (e) { return []; }
};

const EMOJI_LIST = [
  "🧹", "🗑️", "🍽️", "🧺", "🚽", "🍳", "🛒", "📦", "✨", "🐶", 
  "🐱", "🪴", "🚿", "🧽", "🧼", "🪣", "🪟", "🔧", "💡", "🛋️",
  "🛏️", "🧴", "🧻", "📅", "💰", "🧾", "📝", "📢", "🚗", "🚲"
];

export default function RoomieTaskApp() {
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState('landing'); 
  const [groupId, setGroupId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  
  const [users, setUsers] = useState([]);
  const [taskConfigs, setTaskConfigs] = useState([]);
  const [currentCycleTasks, setCurrentCycleTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [myGroups, setMyGroups] = useState([]);

  const [view, setView] = useState('roster');
  const [rosterTab, setRosterTab] = useState('mine');
  const mainScrollRef = useRef(null);
  
  const isQuittingRef = useRef(false);
  const dbRef = useRef(null);

  const [myTasksLimit, setMyTasksLimit] = useState(5);
  const [allTasksLimit, setAllTasksLimit] = useState(5);

  // Modals
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  
  // 🌟 新增：任務操作確認彈窗 State
  const [taskActionConfirm, setTaskActionConfirm] = useState(null); // { action: 'complete'|'release'|'claim', task: object }
  
  const [newNameInput, setNewNameInput] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  
  const [alertMsg, setAlertMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [configForm, setConfigForm] = useState({ 
    name: '', price: 30, freq: 7, icon: '🧹', assigneeOrder: [], nextDate: getTodayString() 
  });
  
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // ==========================================
  // 🚀 初始化
  // ==========================================
  useEffect(() => {
    const savedVer = localStorage.getItem('app_version');
    if (savedVer !== APP_VERSION) {
        localStorage.clear();
        localStorage.setItem('app_version', APP_VERSION);
    }

    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    if (isLocal) {
      const mockUser = { 
        userId: "local-tester-001", 
        displayName: "本地測試員", 
        pictureUrl: "https://ui-avatars.com/api/?name=Tester&background=random" 
      };
      setCurrentUser({ id: mockUser.userId, name: mockUser.displayName, avatar: mockUser.pictureUrl });
      setMyGroups(getSavedGroups());
      
      const gId = new URLSearchParams(window.location.search).get('g');
      if (gId) enterGroup(gId, { id: mockUser.userId, name: mockUser.displayName, avatar: mockUser.pictureUrl });
      else setLoading(false);
      return; 
    }

    let isMounted = true; 

    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (!isMounted) return;

        if (!liff.isLoggedIn()) { 
          if (window.location.search.includes('liff.state')) {
             setLoading(false);
             alert("瀏覽器阻擋了登入狀態，請關閉私密瀏覽或使用 LINE 開啟");
             return;
          }
          liff.login({ redirectUri: window.location.href }); 
          return; 
        }
        
        try {
          const profile = await liff.getProfile();
          if (!isMounted) return;

          const user = { id: profile.userId, name: profile.displayName, avatar: profile.pictureUrl };
          setCurrentUser(user);

          try {
            const snap = await get(ref(db, 'groups'));
            const joinedGroups = [];
            if (snap.exists() && isMounted) {
              const allGroups = snap.val();
              for (const [gId, groupData] of Object.entries(allGroups)) {
                if (groupData && groupData.users && groupData.users[user.id]) {
                  joinedGroups.push({ id: gId, name: groupData.metadata?.name || '我的空間' });
                }
              }
            }
            setMyGroups(joinedGroups);
            localStorage.setItem('roomie_groups', JSON.stringify(joinedGroups));
          } catch (dbError) {
            console.error("強制同步群組失敗:", dbError);
            setMyGroups(getSavedGroups());
          }

          const gId = new URLSearchParams(window.location.search).get('g');
          if (gId) {
            enterGroup(gId, user); 
          } else {
            setLoading(false);
          }
          
        } catch (profileError) {
          console.error("LIFF getProfile 失敗:", profileError);
          liff.logout();
          window.location.reload();
        }

      } catch (err) {
        console.error("LIFF 初始化失敗:", err);
        if (err.message && err.message.toLowerCase().includes("expired")) {
          liff.logout();
          window.location.reload();
          return;
        }
        if (isMounted) {
          setLoading(false);
          alert(`系統錯誤: ${err?.message}`);
        }
      }
    };

    initLiff();

    return () => {
      isMounted = false;
      if (dbRef.current) off(dbRef.current);
    };
  }, []);

  const handleNav = (targetView) => {
    setView(targetView);
    setIsUserMenuOpen(false);
    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
  };

  const handleGoHome = () => {
    if (dbRef.current) off(dbRef.current);
    isQuittingRef.current = false;
    setGroupId(null);
    setViewState('landing');
    setIsUserMenuOpen(false);
    window.history.pushState({}, '', window.location.pathname);
  };

  const enterGroup = async (gId, user) => {
    if (isQuittingRef.current) return;
    setLoading(true);
    setGroupId(gId);
    
    if (dbRef.current) off(dbRef.current);
    
    try {
      const snapshot = await get(ref(db, `groups/${gId}`));
      if (!snapshot.exists()) {
         const saved = getSavedGroups();
         const newGroups = saved.filter(g => g.id !== gId);
         localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
         setMyGroups(newGroups);
         
         setLoading(false);
         setGroupId(null);
         alert("此空間已不存在");
         window.history.pushState({}, '', window.location.pathname);
         return;
      }
      await checkAndGenerateTasks(gId, snapshot.val()); 
    } catch (e) { 
      console.error(e);
      setLoading(false);
    }

    const groupRef = ref(db, `groups/${gId}`);
    dbRef.current = groupRef;

    const newUrl = `${window.location.pathname}?g=${gId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);

    onValue(groupRef, (snap) => {
      if (isQuittingRef.current) return;

      const data = snap.val();
      if (data) {
        if (user && user.id && (!data.users || !data.users[user.id])) {
            const saved = getSavedGroups();
            if (saved.find(g => g.id === gId)) {
                const newGroups = saved.filter(g => g.id !== gId);
                localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
                setMyGroups(newGroups);
                setViewState('landing');
                setLoading(false);
                return;
            } else {
                registerMember(gId, user);
            }
        }

        const safeUsers = data.users ? Object.values(data.users).filter(u => u && u.id) : [];
        setUsers(safeUsers);
        
        const safeConfigs = data.taskConfigs ? Object.values(data.taskConfigs).filter(c => c && c.id) : [];
        setTaskConfigs(safeConfigs);
        
        const safeTasks = data.tasks ? Object.values(data.tasks).filter(t => t && t.id && t.date) : [];
        setCurrentCycleTasks(safeTasks.sort((a,b) => (a.date || '').localeCompare(b.date || '')));
        
        const safeLogs = data.logs ? Object.values(data.logs).filter(l => l).sort((a,b) => b.id - a.id) : [];
        setLogs(safeLogs);
        
        setGroupName(data.metadata?.name || '我的空間');
        
        if (user && user.id && data.users && data.users[user.id] && !isQuittingRef.current) {
            const saved = getSavedGroups();
            const currentName = data.metadata?.name || '新空間';
            const isNameDiff = saved.find(g => g.id === gId)?.name !== currentName;
            
            if (!saved.find(g => g.id === gId) || isNameDiff) {
              const otherGroups = saved.filter(g => g.id !== gId);
              const updated = [{ id: gId, name: currentName }, ...otherGroups].slice(0, 10);
              localStorage.setItem('roomie_groups', JSON.stringify(updated));
              setMyGroups(updated);
            }
        }
        
        setViewState('app');
      } else { 
        setViewState('landing'); 
      }
      setLoading(false);
    });
  };

  const checkAndGenerateTasks = async (gId, data) => {
    if (!data || !data.taskConfigs || !data.users) return;
    const updates = {};
    const configs = Object.values(data.taskConfigs);
    const allUserIds = Object.keys(data.users);
    if (allUserIds.length === 0) return;

    let hasUpdates = false;
    const limitDate = addDays(getTodayString(), 45); 

    configs.forEach(cfg => {
      let nextDate = cfg.nextDate || getTodayString();
      let order = (cfg.assigneeOrder && cfg.assigneeOrder.length > 0) ? cfg.assigneeOrder : allUserIds;
      order = order.filter(uid => allUserIds.includes(uid));
      if (order.length === 0) order = allUserIds;

      let runningAssigneeId = cfg.nextAssigneeId;
      if (!runningAssigneeId || !order.includes(runningAssigneeId)) runningAssigneeId = order[0];

      let loopCount = 0;
      while (nextDate <= limitDate && loopCount < 50) {
        loopCount++;
        const tid = `task-${cfg.id}-${nextDate.replace(/-/g, '')}`;
        if (!data.tasks || !data.tasks[tid]) {
            updates[`groups/${gId}/tasks/${tid}`] = {
              id: tid, configId: cfg.id, name: cfg.name, price: cfg.price, icon: cfg.icon,
              date: nextDate, status: 'pending', currentHolderId: runningAssigneeId
            };
        }
        const currIdx = order.indexOf(runningAssigneeId);
        const nextIdx = (currIdx + 1) % order.length;
        runningAssigneeId = order[nextIdx];
        nextDate = addDays(nextDate, typeof cfg.freq === 'string' ? parseInt(cfg.freq.match(/\d+/)?.[0] || '7') : cfg.freq);
        updates[`groups/${gId}/taskConfigs/${cfg.id}/nextDate`] = nextDate;
        updates[`groups/${gId}/taskConfigs/${cfg.id}/nextAssigneeId`] = runningAssigneeId; 
        hasUpdates = true;
      }
    });
    if (hasUpdates) await update(ref(db), updates);
  };

  const registerMember = (gId, user) => {
    update(ref(db, `groups/${gId}/users/${user.id}`), { ...user, balance: 0, joinedAt: serverTimestamp() });
  };

  const handleRenameGroup = async () => {
    if (newNameInput.trim()) {
      await update(ref(db, `groups/${groupId}/metadata`), { name: newNameInput });
      const newGroups = myGroups.map(g => g.id === groupId ? { ...g, name: newNameInput } : g);
      setMyGroups(newGroups);
      localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
      setShowRenameModal(false);
    }
  };

  const handleResetGroup = async () => {
    try {
        const updates = {};
        updates[`groups/${groupId}/tasks`] = null;
        updates[`groups/${groupId}/logs`] = null;
        updates[`groups/${groupId}/taskConfigs`] = null;
        users.forEach(u => updates[`groups/${groupId}/users/${u.id}/balance`] = 0);
        
        await update(ref(db), updates);

        const logId = Date.now();
        await set(ref(db, `groups/${groupId}/logs/${logId}`), { 
            id: logId, msg: `${currentUser.name} 重置了群組`, type: 'warning', time: new Date().toLocaleTimeString() 
        });

        setShowResetModal(false);
        setAlertMsg("群組已完全重置");
    } catch (e) { alert("重置失敗"); }
  };

  const handleQuitGroupConfirm = async () => {
    isQuittingRef.current = true; 
    if (dbRef.current) off(dbRef.current);
    try {
      const logId = Date.now();
      await set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `${currentUser.name} 離開了空間`, type: 'warning', time: new Date().toLocaleTimeString() });
      await remove(ref(db, `groups/${groupId}/users/${currentUser.id}`));
      
      const currentSaved = getSavedGroups(); 
      const newGroups = currentSaved.filter(g => g.id !== groupId);
      localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
      setMyGroups(newGroups);
      
      setShowQuitModal(false);
      handleGoHome();
    } catch (e) { alert("退出失敗，請重試"); isQuittingRef.current = false; }
  };

  const handleCreateGroupConfirm = async () => {
    if (!newGroupName.trim()) return;
    setLoading(true);
    isQuittingRef.current = false;

    const gid = `rm-${generateId()}`;
    await set(ref(db, `groups/${gid}`), { 
        metadata: { name: newGroupName, createdAt: serverTimestamp() }, 
        users: { [currentUser.id]: { ...currentUser, balance: 0, joinedAt: serverTimestamp() } },
        logs: { [Date.now()]: { id: Date.now(), msg: `空間「${newGroupName}」已建立`, type: 'info', time: new Date().toLocaleTimeString() } } 
    });
    setShowCreateGroupModal(false);
    enterGroup(gid, currentUser);
  };

  // 🌟 新增：統一執行任務操作的函式 (由確認彈窗觸發)
  const executeTaskAction = async () => {
    if (!taskActionConfirm) return;
    const { action, task } = taskActionConfirm;
    setTaskActionConfirm(null); // 先關閉彈窗
    
    if (action === 'complete') await completeTask(task);
    if (action === 'release') await releaseTask(task);
    if (action === 'claim') await claimTask(task);
  };

  const completeTask = async (task) => {
    if (task.date > getTodayString()) { setAlertMsg("只能完成今天以前的任務喔！"); return; }
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'done';
    if (task.originalHolderId && task.originalHolderId !== currentUser.id) {
        const originalUser = users.find(u => u.id === task.originalHolderId);
        const myUser = users.find(u => u.id === currentUser.id);
        if (originalUser && myUser) {
            updates[`groups/${groupId}/users/${task.originalHolderId}/balance`] = originalUser.balance - (task.price || 0);
            updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myUser.balance + (task.price || 0);
            const logId = Date.now();
            updates[`groups/${groupId}/logs/${logId}`] = { 
                id: logId, msg: `${currentUser.name} 完成了 ${task.name} (由 ${originalUser.name} 支付)`, type: 'success', time: new Date().toLocaleTimeString() 
            };
        }
    } else {
        const logId = Date.now();
        updates[`groups/${groupId}/logs/${logId}`] = { id: logId, msg: `${currentUser.name} 完成了 ${task.name}`, type: 'success', time: new Date().toLocaleTimeString() };
    }
    await update(ref(db), updates);
  };
  
  const releaseTask = async (task) => {
    update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'open', currentHolderId: null, originalHolderId: currentUser.id });
    const logId = Date.now();
    set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `${currentUser.name} 釋出 ${task.name}`, type: 'warning', time: new Date().toLocaleTimeString() });
  };

  const claimTask = async (task) => {
    update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'pending', currentHolderId: currentUser.id });
    const logId = Date.now();
    set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `${currentUser.name} 接手了 ${task.name}`, type: 'info', time: new Date().toLocaleTimeString() });
  };

  const toggleUserInOrder = (uid) => {
    const currentOrder = configForm.assigneeOrder || [];
    if (currentOrder.includes(uid)) {
      setConfigForm({ ...configForm, assigneeOrder: currentOrder.filter(id => id !== uid) });
    } else {
      setConfigForm({ ...configForm, assigneeOrder: [...currentOrder, uid] });
    }
  };

  const handleOpenAddConfig = () => {
    setEditingConfigId(null);
    setConfigForm({ 
      name: '', price: 30, freq: 7, icon: '🧹', 
      assigneeOrder: users.map(u => u.id), 
      nextDate: getTodayString() 
    });
    setFormError('');
    setIsEditingConfig(true);
  };

  const saveConfig = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      if (!configForm.name.trim()) { alert("請輸入家事名稱！"); setIsSaving(false); return; }
      if (configForm.price <= 0 || configForm.freq <= 0) { alert("金額與頻率必須大於 0！"); setIsSaving(false); return; }
      
      let assigneeOrder = configForm.assigneeOrder;
      if (!assigneeOrder || assigneeOrder.length === 0) {
        assigneeOrder = users.map(u => u.id);
      }

      const id = editingConfigId || `cfg-${generateId()}`;
      const freqStr = typeof configForm.freq === 'string' ? configForm.freq : `每 ${configForm.freq} 天`;
      const freqNum = parseInt(String(configForm.freq).match(/\d+/)?.[0] || '7');

      const updates = {};

      let earliestPendingDate = null;
      const tasksSnap = await get(ref(db, `groups/${groupId}/tasks`));
      
      if (tasksSnap.exists()) {
          const allTasks = tasksSnap.val();
          const relatedTasks = Object.values(allTasks).filter(t => t.configId === id && t.status !== 'done');
          if (relatedTasks.length > 0) {
              relatedTasks.sort((a,b) => a.date.localeCompare(b.date));
              earliestPendingDate = relatedTasks[0].date;
              relatedTasks.forEach(t => {
                  updates[`groups/${groupId}/tasks/${t.id}`] = null;
              });
          }
      }

      let nextDate;
      if (editingConfigId && earliestPendingDate) {
          nextDate = earliestPendingDate; 
      } else {
          nextDate = configForm.nextDate || getTodayString();
      }

      let runningAssigneeId = assigneeOrder[0];
      if (editingConfigId && configForm.nextAssigneeId && assigneeOrder.includes(configForm.nextAssigneeId)) {
          runningAssigneeId = configForm.nextAssigneeId;
      }

      const limitDate = addDays(getTodayString(), 45);
      let loopCount = 0;

      while (nextDate <= limitDate && loopCount < 50) {
          loopCount++;
          const tid = `task-${id}-${nextDate.replace(/-/g, '')}`;
          updates[`groups/${groupId}/tasks/${tid}`] = {
              id: tid, configId: id, name: configForm.name, price: configForm.price, icon: configForm.icon,
              date: nextDate, status: 'pending', currentHolderId: runningAssigneeId
          };
          const currIdx = assigneeOrder.indexOf(runningAssigneeId);
          const nextIdx = (currIdx + 1) % assigneeOrder.length;
          runningAssigneeId = assigneeOrder[nextIdx];
          nextDate = addDays(nextDate, freqNum);
      }

      const configData = { 
        ...configForm, id, freq: freqStr, assigneeOrder, 
        nextAssigneeId: runningAssigneeId, nextDate: nextDate 
      };
      updates[`groups/${groupId}/taskConfigs/${id}`] = configData;

      await update(ref(db), updates);
      
      const logId = Date.now();
      const actionMsg = editingConfigId ? `編輯了家事：${configForm.name}` : `新增了家事：${configForm.name}`;
      await set(ref(db, `groups/${groupId}/logs/${logId}`), { 
         id: logId, msg: `${currentUser.name} ${actionMsg}`, type: 'info', time: new Date().toLocaleTimeString() 
      });

      setIsEditingConfig(false);
      setAlertMsg("排班已更新！");

    } catch (error) {
      console.error(error);
      alert("儲存失敗，請檢查網路");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteConfigConfirm = async () => {
    if (deleteTarget && deleteTarget.type === 'config') {
       const tasksSnap = await get(ref(db, `groups/${groupId}/tasks`));
       const updates = {};
       if (tasksSnap.exists()) {
           const allTasks = tasksSnap.val();
           Object.values(allTasks).forEach(t => {
               if (t.configId === deleteTarget.id) updates[`groups/${groupId}/tasks/${t.id}`] = null;
           });
       }
       updates[`groups/${groupId}/taskConfigs/${deleteTarget.id}`] = null;
       await update(ref(db), updates);
       setDeleteTarget(null);
    }
  };

  const calculateSettlements = () => {
    const validUsers = users.filter(u => u && typeof u.balance === 'number');
    if (validUsers.length === 0) return [];
    let balances = validUsers.filter(u => Math.abs(u.balance) > 0.1).map(u => ({...u}));
    let transactions = [];
    let debtors = balances.filter(u => u.balance < 0).sort((a,b) => a.balance - b.balance);
    let creditors = balances.filter(u => u.balance > 0).sort((a,b) => b.balance - a.balance);

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
       let debtor = debtors[i];
       let creditor = creditors[j];
       let amount = Math.min(Math.abs(debtor.balance), creditor.balance);
       if (amount > 0) {
         transactions.push({ fromId: debtor.id, fromName: debtor.name, toId: creditor.id, toName: creditor.name, amount: Math.round(amount) });
       }
       debtor.balance += amount; creditor.balance -= amount;
       if (Math.abs(debtor.balance) < 0.1) i++;
       if (creditor.balance < 0.1) j++;
    }
    return transactions;
  };

  const settleDebt = async (tx) => {
    const fromUser = users.find(u => u.id === tx.fromId);
    const toUser = users.find(u => u.id === tx.toId);
    if (!fromUser || !toUser) return;
    const updates = {};
    updates[`groups/${groupId}/users/${tx.fromId}/balance`] = fromUser.balance + tx.amount;
    updates[`groups/${groupId}/users/${tx.toId}/balance`] = toUser.balance - tx.amount;
    const logId = Date.now();
    updates[`groups/${groupId}/logs/${logId}`] = { id: logId, msg: `${tx.fromName} 支付了 $${tx.amount} 給 ${tx.toName} (已結清)`, type: 'info', time: new Date().toLocaleTimeString() };
    await update(ref(db), updates);
    setAlertMsg("結帳成功！");
  };

  const limitDate = addDays(getTodayString(), 45);
  const validConfigIds = taskConfigs.map(c => c.id);
  const visibleTasks = currentCycleTasks.filter(t => validConfigIds.includes(t.configId) && (t.date <= limitDate) && (t.status !== 'done' || t.date >= getTodayString()));
  const myTasks = visibleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending');
  const allTasks = visibleTasks;

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#28C8C8]"/></div>;

  if (viewState === 'landing') return (
    <div className="max-w-md mx-auto h-[100dvh] flex flex-col p-8 bg-white relative">
      <div className="flex-1">
        <h1 className="text-3xl font-bold mb-2">👋 嗨，{currentUser?.name}</h1>
        <p className="text-gray-500 mb-8">歡迎回到家事交易所</p>
        
        <h3 className="font-bold text-gray-800 text-base mb-4">已加入的空間</h3>

        <div className="space-y-4">
          {myGroups.length === 0 ? (
            <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl text-sm space-y-4 bg-gray-50/50">
              <p>您目前還沒有加入任何空間喔</p>
            </div>
          ) : (
            myGroups.map(g => (
              <div key={g.id} onClick={() => { isQuittingRef.current = false; enterGroup(g.id, currentUser); }} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center active:scale-95 transition-all cursor-pointer hover:border-[#28C8C8]/50 group">
                <span className="font-bold text-gray-700 text-base group-hover:text-[#28C8C8] transition-colors">{g.name}</span>
                <div className="text-[#28C8C8] font-bold text-base bg-[#28C8C8]/10 px-3 py-1 rounded-lg">進入</div>
              </div>
            ))
          )}
        </div>
      </div>
      <button onClick={() => { setNewGroupName(`${currentUser?.name || '我'} 的家`); setShowCreateGroupModal(true); }} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold shadow-xl shadow-[#28C8C8]/30 active:scale-95 transition-all text-lg mt-6">建立新空間</button>
      
      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6">
            <h3 className="text-xl font-bold mb-4 text-center">建立新空間</h3>
            <input type="text" id="new-group-name" name="groupName" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="輸入空間名稱" className="w-full p-4 bg-gray-50 rounded-xl mb-6 text-center font-bold text-lg"/>
            <div className="flex gap-3">
              <button onClick={() => setShowCreateGroupModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold">取消</button>
              <button onClick={handleCreateGroupConfirm} className="flex-1 py-3 bg-[#28C8C8] text-white rounded-xl font-bold">建立</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-gray-50 max-w-md mx-auto flex flex-col h-[100dvh]">
      <header className="flex-none bg-white p-4 border-b flex justify-between items-center z-50 shadow-sm relative">
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-lg text-gray-800 truncate max-w-[150px]">{groupName}</h1>
          <Edit2 size={16} className="text-gray-400 cursor-pointer hover:text-[#28C8C8]" onClick={() => { setNewNameInput(groupName); setShowRenameModal(true); }}/>
        </div>
        <div className="relative">
          <div onClick={(e) => { e.stopPropagation(); setIsUserMenuOpen(!isUserMenuOpen); }} className="flex items-center gap-2 bg-gray-100 p-1 pr-3 rounded-full cursor-pointer hover:bg-gray-200 transition-colors">
            <img src={currentUser?.avatar} className="w-8 h-8 rounded-full border border-white object-cover" />
            <span className="text-sm font-bold text-gray-700">{currentUser?.name}</span>
          </div>
          {isUserMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>
              <div className="absolute right-0 top-12 w-48 bg-white border rounded-xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2">
                 <button onClick={handleGoHome} className="w-full text-left p-4 text-base border-b flex items-center gap-3 hover:bg-gray-50 font-bold text-gray-600"><Home size={18}/> 我的空間</button>
                 <button onClick={() => { setIsUserMenuOpen(false); setShowResetModal(true); }} className="w-full text-left p-4 text-base border-b flex items-center gap-3 hover:bg-gray-50 font-bold text-gray-700"><RotateCcw size={18}/> 重置群組</button>
                 <button onClick={() => { setIsUserMenuOpen(false); setShowQuitModal(true); }} className="w-full text-left p-4 text-base text-red-500 flex items-center gap-3 hover:bg-gray-50 font-bold"><LogOut size={18}/> 退出群組</button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24 overscroll-contain" ref={mainScrollRef}>
        {view === 'roster' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="sticky top-0 z-20 bg-gray-50 pt-2 pb-4 px-1">
              <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
                <button onClick={() => setRosterTab('mine')} className={`flex-1 py-3 rounded-xl text-base font-bold transition-all ${rosterTab === 'mine' ? 'bg-[#28C8C8]/10 text-[#28C8C8]' : 'text-gray-400 hover:text-gray-600'}`}>近期待辦</button>
                <button onClick={() => setRosterTab('all')} className={`flex-1 py-3 rounded-xl text-base font-bold transition-all ${rosterTab === 'all' ? 'bg-[#28C8C8]/10 text-[#28C8C8]' : 'text-gray-400 hover:text-gray-600'}`}>任務列表</button>
              </div>
            </div>

            {rosterTab === 'mine' && (
              <div className="space-y-3">
                {myTasks.length === 0 ? 
                  <div className="p-10 text-center text-gray-400 text-base bg-white rounded-2xl border border-dashed border-gray-200">目前沒有任務 🎉</div> :
                  myTasks.slice(0, myTasksLimit).map(task => (
                    <div key={task.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between hover:border-[#28C8C8]/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-3xl">{task.icon}</div>
                        <div><div className="font-bold text-base text-gray-800">{task.name}</div><div className="text-sm text-[#28C8C8] font-bold mt-0.5">{task.date}</div></div>
                      </div>
                      <div className="flex gap-2">
                        {/* 🌟 修改：釋出按鈕觸發彈窗 */}
                        <button onClick={() => setTaskActionConfirm({ action: 'release', task })} className="bg-red-50 hover:bg-red-100 text-red-500 px-4 py-2 rounded-xl text-sm font-bold transition-colors">沒空</button>
                        
                        {/* 🌟 修改：完成按鈕觸發彈窗 (保留未來任務防呆) */}
                        <button onClick={() => {
                          if (task.date > getTodayString()) setAlertMsg("只能完成今天以前的任務喔！");
                          else setTaskActionConfirm({ action: 'complete', task });
                        }} className={`text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-transform active:scale-95 ${task.date > getTodayString() ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-[#28C8C8] shadow-[#28C8C8]/30 hover:bg-[#20a0a0]'}`}>完成</button>
                      </div>
                    </div>
                  ))
                }
                {myTasks.length > myTasksLimit && <button onClick={() => setMyTasksLimit(l => l + 5)} className="w-full py-3 text-center text-[#28C8C8] font-bold text-sm bg-white border border-[#28C8C8]/20 rounded-xl hover:bg-[#28C8C8]/5 transition-colors">查看更多</button>}
              </div>
            )}

            {rosterTab === 'all' && (
              <div className="space-y-3">
                {allTasks.length === 0 ? <div className="p-10 text-center text-gray-400 text-base bg-white rounded-2xl border border-dashed border-gray-200">目前沒有任務 🎉</div> :
                  allTasks.slice(0, allTasksLimit).map(task => {
                    const isOpen = task.status === 'open';
                    const isDone = task.status === 'done';
                    const holder = users.find(u => u.id === task.currentHolderId);
                    return (
                      <div key={task.id} className={`p-4 rounded-2xl shadow-sm border flex items-center justify-between transition-colors ${isOpen ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-3xl ${isDone ? 'opacity-30 bg-gray-50' : isOpen ? 'bg-white' : 'bg-gray-50'}`}>{task.icon}</div>
                          <div>
                            <div className="font-bold text-base text-gray-800">{task.name}</div>
                            <div className="text-sm text-gray-500 font-bold mt-0.5 flex items-center gap-1.5">
                              <span className="font-mono bg-gray-100 px-1.5 rounded">{task.date}</span>
                              <span>·</span>
                              <div className="flex items-center gap-1">
                                {holder && <img src={holder.avatar} className="w-4 h-4 rounded-full"/>}
                                {holder ? holder.name : '未分配'}
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* 🌟 修改：接單按鈕觸發彈窗 */}
                        {isOpen && <button onClick={() => setTaskActionConfirm({ action: 'claim', task })} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md shadow-red-200 active:scale-95 transition-all">接單</button>}
                        {isDone && <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center text-green-500"><Check size={20}/></div>}
                      </div>
                    )
                  })
                }
                {allTasks.length > allTasksLimit && <button onClick={() => setAllTasksLimit(l => l + 5)} className="w-full py-3 text-center text-[#28C8C8] font-bold text-sm bg-white border border-[#28C8C8]/20 rounded-xl hover:bg-[#28C8C8]/5 transition-colors">查看更多</button>}
              </div>
            )}
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-gradient-to-br from-[#28C8C8] to-[#1facac] p-8 rounded-3xl text-white shadow-lg shadow-[#28C8C8]/30 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
              <div className="text-sm font-bold opacity-90 mb-2">我的總餘額</div>
              <div className="text-5xl font-bold font-mono tracking-tight flex items-baseline gap-1">
                <span className="text-2xl">$</span>
                {users.find(u => u.id === currentUser?.id)?.balance || 0}
              </div>
            </div>
            
            <div className="bg-white rounded-2xl border shadow-sm p-5">
              <h3 className="font-bold text-gray-800 mb-4 text-lg flex items-center gap-2"><AlertCircle size={18} className="text-[#28C8C8]"/> 還款建議</h3>
              <div className="space-y-3">
                 {calculateSettlements().length === 0 ? <p className="text-gray-400 text-sm py-4 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">目前帳務完美平衡 ✨</p> : 
                   calculateSettlements().map((tx, idx) => (
                     <div key={idx} className="bg-white border border-gray-100 p-4 rounded-xl flex items-center justify-between shadow-sm">
                        <div className="flex flex-col gap-1 text-sm font-bold text-gray-700">
                          <div className="flex items-center gap-2">
                            <span>{tx.fromName}</span>
                            <ArrowRight size={14} className="text-gray-400"/>
                            <span>{tx.toName}</span>
                          </div>
                          <div className="text-red-500 font-mono text-base">需支付 ${tx.amount}</div>
                        </div>
                        <button onClick={() => settleDebt(tx)} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">點擊結清</button>
                     </div>
                   ))
                 }
              </div>
            </div>

            <div>
               <h3 className="font-bold text-gray-800 mb-3 px-1 text-lg">成員餘額</h3>
               <div className="bg-white rounded-2xl border shadow-sm divide-y">
                 {users.map(u => (
                   <div key={u.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                     <div className="flex items-center gap-4">
                       <img src={u.avatar} className="w-12 h-12 rounded-full border-2 border-white shadow-sm object-cover"/>
                       <span className="font-bold text-base text-gray-800">{u.name}</span>
                     </div>
                     <span className={`font-bold font-mono text-2xl ${u.balance >= 0 ? 'text-[#28C8C8]' : 'text-red-500'}`}>{u.balance > 0 ? '+' : ''}{u.balance}</span>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="animate-in fade-in">
            <h3 className="font-bold text-gray-800 mb-6 text-lg">系統動態</h3>
            <div className="space-y-0 pl-4 border-l-2 border-gray-100 ml-2">
              {logs.length === 0 ? <div className="text-center text-gray-400 py-10">暫無動態</div> : 
                logs.map((log, i) => (
                  <div key={log.id} className="relative pb-8 last:pb-2">
                    <div className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-[3px] border-white shadow-sm ${log.type === 'success' ? 'bg-green-500' : log.type === 'warning' ? 'bg-red-500' : 'bg-[#28C8C8]'}`}></div>
                    <div className="text-base text-gray-800 font-bold leading-tight bg-white p-3 rounded-xl shadow-sm border border-gray-50 -mt-2 ml-4 relative">
                      <div className="absolute w-3 h-3 bg-white border-t border-l border-gray-50 transform -rotate-45 -left-1.5 top-3"></div>
                      <span className="relative z-10">{log.msg}</span>
                    </div>
                    <div className="text-xs text-gray-400 font-bold mt-1.5 ml-5">{log.time}</div>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-white p-5 rounded-2xl border shadow-sm">
               <div className="flex justify-between items-center mb-5">
                 <div>
                   <h3 className="font-bold text-gray-800 text-lg">室友列表</h3>
                   <p className="text-xs text-gray-400 mt-1 font-bold">目前共有 {users.length} 位成員</p>
                 </div>
                 <button onClick={() => setShowShareModal(true)} className="bg-[#28C8C8]/10 text-[#28C8C8] hover:bg-[#28C8C8]/20 px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-1.5"><Plus size={16}/> 邀請</button>
               </div>
               <div className="grid grid-cols-4 gap-4">
                 {users.map(u => (
                   <div key={u.id} className="flex flex-col items-center gap-2">
                     <img src={u.avatar} className="w-14 h-14 rounded-full border border-gray-100 object-cover shadow-sm"/>
                     <span className="font-bold text-xs text-gray-700 truncate w-full text-center">{u.name}</span>
                   </div>
                 ))}
               </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border shadow-sm space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-gray-50">
                <h3 className="font-bold text-gray-800 text-lg">家事規則</h3>
                <button onClick={handleOpenAddConfig} className="bg-[#28C8C8]/10 text-[#28C8C8] hover:bg-[#28C8C8]/20 px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-1.5"><Plus size={16}/> 新增</button>
              </div>
              <div className="space-y-3">
                {taskConfigs.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-4 bg-gray-50 border border-transparent hover:border-gray-200 rounded-xl transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-3xl">{c.icon}</div>
                      <div>
                        <div className="font-bold text-base text-gray-800">{c.name}</div>
                        <div className="text-sm text-gray-500 font-bold mt-0.5"><span className="text-[#28C8C8]">${c.price}</span> / {c.freq}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { 
                         setEditingConfigId(c.id); 
                         const freqNum = c.freq && typeof c.freq === 'string' ? parseInt(c.freq.match(/\d+/)?.[0] || '7') : 7;
                         setConfigForm({ 
                           ...c, 
                           freq: freqNum, 
                           nextDate: c.nextDate || getTodayString(), 
                           assigneeOrder: c.assigneeOrder || users.map(u => u.id),
                           nextAssigneeId: c.nextAssigneeId
                         }); 
                         setIsEditingConfig(true); 
                      }} className="p-2 text-gray-400 hover:text-[#28C8C8] hover:bg-white rounded-lg transition-colors"><Edit2 size={18}/></button>
                      <button onClick={() => setDeleteTarget({ type: 'config', id: c.id })} className="p-2 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-colors"><Trash2 size={18}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="flex-none bg-white border-t flex justify-around pb-8 pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-30">
        {[{id:'roster', icon:CheckCircle2, label:'值日表'}, {id:'wallet', icon:Wallet, label:'帳本'}, {id:'history', icon:Loader2, label:'動態'}, {id:'settings', icon:Settings, label:'設定'}].map(n => (
          <button key={n.id} onClick={() => handleNav(n.id)} className={`flex flex-col items-center w-full py-2 transition-all ${view === n.id ? 'text-[#28C8C8] scale-110' : 'text-gray-400 hover:text-gray-600'}`}><n.icon size={26}/><span className="text-xs font-bold mt-1.5">{n.label}</span></button>
        ))}
      </nav>

      {/* --- Modals --- */}
      
      {/* 🌟 新增：任務操作確認彈窗 */}
      {taskActionConfirm && (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-6 backdrop-blur-sm" onClick={() => setTaskActionConfirm(null)}>
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-in zoom-in-95 shadow-2xl" onClick={e => e.stopPropagation()}>
             <div className={`mb-4 flex justify-center w-20 h-20 mx-auto rounded-full items-center ${taskActionConfirm.action === 'release' ? 'bg-red-50 text-red-500' : 'bg-[#28C8C8]/10 text-[#28C8C8]'}`}>
               {taskActionConfirm.action === 'release' ? <AlertCircle size={40}/> : <CheckCircle2 size={40}/>}
             </div>
             <h3 className="font-bold text-xl mb-2 text-gray-800">
               {taskActionConfirm.action === 'complete' && '確定完成任務？'}
               {taskActionConfirm.action === 'release' && '確定沒空做嗎？'}
               {taskActionConfirm.action === 'claim' && '確定要接下此任務？'}
             </h3>
<p className="text-gray-500 mb-6 text-sm font-bold leading-relaxed px-2">
  {taskActionConfirm.action === 'complete' && `點擊後即完成「${taskActionConfirm.task.name}」`}
  {taskActionConfirm.action === 'release' && (
    <>
      釋出「{taskActionConfirm.task.name}」將扣除 ${taskActionConfirm.task.price} <br />
      轉為賞金並等待其他人接單
    </>
  )}
  {taskActionConfirm.action === 'claim' && (
    <>
      接手「{taskActionConfirm.task.name}」完成後將獲得 ${taskActionConfirm.task.price}！<br />
      若未完成，將會扣除相應金額作為懲罰喔！
    </>
  )}
</p>
             <div className="flex gap-3">
               <button onClick={() => setTaskActionConfirm(null)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold transition-colors">取消</button>
               <button onClick={executeTaskAction} className={`flex-1 py-3 text-white rounded-xl font-bold shadow-lg transition-colors ${
                  taskActionConfirm.action === 'release' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-[#28C8C8] hover:bg-[#20a0a0] shadow-[#28C8C8]/30'
               }`}>
                 確定
               </button>
             </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-6 backdrop-blur-sm" onClick={() => setShowShareModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-in zoom-in-95 shadow-2xl" onClick={e => e.stopPropagation()}>
             <h3 className="font-bold text-xl mb-6 text-gray-800 text-center">邀請室友</h3>
             <div className="space-y-3">
               <button 
                 onClick={async () => {
                   const link = `https://liff.line.me/${LIFF_ID}?g=${groupId}`;
                   const shareText = `歡迎加入 ${groupName} 一起分擔家事吧 ！\n${link}`;
                   if (liff.isInClient() && liff.isApiAvailable('shareTargetPicker')) {
                     await liff.shareTargetPicker([{ type: "text", text: shareText }]);
                   } else {
                     window.open(`https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`, '_blank');
                   }
                   setShowShareModal(false);
                 }} 
                 className="w-full py-4 bg-[#06C755] hover:bg-[#05b34c] text-white rounded-xl font-bold shadow-lg shadow-[#06C755]/30 transition-colors flex items-center justify-center gap-2"
               >
                 <Send size={18}/> 分享至 LINE
               </button>
               
               <button 
                 onClick={() => {
                   const link = `https://liff.line.me/${LIFF_ID}?g=${groupId}`;
                   navigator.clipboard.writeText(link);
                   setShowShareModal(false);
                   setAlertMsg("連結已複製");
                 }} 
                 className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
               >
                 <Copy size={18}/> 複製連結
               </button>
             </div>
             <button onClick={() => setShowShareModal(false)} className="w-full mt-4 py-3 text-gray-400 font-bold hover:text-gray-600 transition-colors">取消</button>
          </div>
        </div>
      )}

      {showRenameModal && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-in zoom-in-95 shadow-2xl">
             <h3 className="font-bold text-xl mb-4 text-gray-800">修改空間名稱</h3>
             <input type="text" id="rename-input" name="rename-input" value={newNameInput} onChange={e => setNewNameInput(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl mb-6 text-center font-bold text-lg border border-gray-200 focus:border-[#28C8C8] outline-none transition-colors"/>
             <div className="flex gap-3">
               <button onClick={() => setShowRenameModal(false)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold transition-colors">取消</button>
               <button onClick={handleRenameGroup} className="flex-1 py-3 bg-[#28C8C8] hover:bg-[#20a0a0] text-white rounded-xl font-bold shadow-lg shadow-[#28C8C8]/30 transition-colors">確定</button>
             </div>
          </div>
        </div>
      )}

      {showQuitModal && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-in zoom-in-95 shadow-2xl">
             <div className="mb-4 text-red-500 flex justify-center bg-red-50 w-20 h-20 mx-auto rounded-full items-center"><AlertCircle size={40}/></div>
             <h3 className="font-bold text-xl mb-2 text-gray-800">確定退出群組？</h3>
             <p className="text-gray-500 mb-6 text-sm font-bold">您將會從成員名單中移除，但歷史紀錄會保留。</p>
             <div className="flex gap-3">
               <button onClick={() => setShowQuitModal(false)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold transition-colors">取消</button>
               <button onClick={handleQuitGroupConfirm} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-500/30 transition-colors">退出</button>
             </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-in zoom-in-95 shadow-2xl">
             <div className="mb-4 text-red-500 flex justify-center bg-red-50 w-20 h-20 mx-auto rounded-full items-center"><AlertCircle size={40}/></div>
             <h3 className="font-bold text-xl mb-2 text-gray-900">確定重置群組？</h3>
             <p className="text-gray-500 mb-6 text-sm font-bold leading-relaxed">這將清空所有任務、日誌與家事規則，並將所有人餘額歸零。</p>
             <div className="flex gap-3">
               <button onClick={() => setShowResetModal(false)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold transition-colors">取消</button>
               <button onClick={handleResetGroup} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-500/30 transition-colors">重置</button>
             </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-in zoom-in-95 shadow-2xl">
             <div className="mb-4 text-red-500 flex justify-center bg-red-50 w-20 h-20 mx-auto rounded-full items-center"><AlertCircle size={40}/></div>
             <h3 className="font-bold text-xl mb-2 text-gray-800">確定刪除？</h3>
             <p className="text-gray-500 mb-6 text-sm font-bold">此動作將刪除該規則及其未來的待辦任務。</p>
             <div className="flex gap-3">
               <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold transition-colors">取消</button>
               <button onClick={deleteConfigConfirm} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-500/30 transition-colors">刪除</button>
             </div>
          </div>
        </div>
      )}

      {isEditingConfig && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end sm:justify-center backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 space-y-5 animate-in slide-in-from-bottom-5 sm:max-w-sm sm:mx-auto sm:w-full shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <h2 className="font-bold text-xl text-gray-800">{editingConfigId ? '編輯家事' : '新增家事'}</h2>
              <button onClick={() => setIsEditingConfig(false)} className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-full transition-colors"><X size={20}/></button>
            </div>
            
            <div className="flex gap-3 relative">
              <div onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="w-16 h-14 bg-gray-50 rounded-2xl text-center text-3xl cursor-pointer hover:bg-gray-100 flex items-center justify-center border border-gray-200 transition-colors shrink-0">{configForm.icon}</div>
              <input type="text" id="task-name" name="taskName" placeholder="名稱 (如：倒垃圾)" value={configForm.name} onChange={e => setConfigForm({...configForm, name:e.target.value})} className="flex-1 px-4 bg-gray-50 rounded-2xl text-lg font-bold border border-gray-200 outline-none focus:border-[#28C8C8] h-14 transition-colors placeholder:text-gray-400"/>
              
              {showEmojiPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)}></div>
                  <div className="absolute top-16 left-0 bg-white shadow-2xl rounded-2xl border border-gray-100 p-4 grid grid-cols-6 gap-2 w-full z-50 h-64 overflow-y-auto animate-in fade-in zoom-in-95">
                    {EMOJI_LIST.map(e => <button key={e} onClick={() => { setConfigForm({...configForm, icon:e}); setShowEmojiPicker(false); }} className="text-2xl hover:bg-gray-50 p-2 rounded-xl transition-colors">{e}</button>)}
                  </div>
                </>
              )}
            </div>
            {formError && <p className="text-red-500 text-sm font-bold ml-1">{formError}</p>}

            <div className="relative">
              <input type="number" id="task-price" name="taskPrice" value={configForm.price === 0 ? '' : configForm.price} onChange={e => setConfigForm({...configForm, price: e.target.value === '' ? 0 : Number(e.target.value)})} className="w-full h-14 px-4 pl-10 bg-gray-50 border border-gray-200 rounded-2xl font-mono text-xl font-bold outline-none focus:border-[#28C8C8] transition-colors"/>
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">$</span>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">元</span>
            </div>

            <div className="relative">
              <input type="number" id="task-freq" name="taskFreq" value={configForm.freq === 0 ? '' : configForm.freq} onChange={e => setConfigForm({...configForm, freq: e.target.value === '' ? 0 : Number(e.target.value)})} className="w-full h-14 px-4 pl-14 bg-gray-50 border border-gray-200 rounded-2xl font-mono text-xl font-bold outline-none focus:border-[#28C8C8] text-left transition-colors"/>
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">每</span>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">日一次</span>
            </div>

            <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <span className="text-sm font-bold text-gray-700 block text-center">設定排班順序</span>
              <div id="assignee-order" className="flex gap-4 overflow-x-auto pb-2 justify-center">
                {users.map(u => {
                  if (!u || !u.id) return null; 
                  const idx = (configForm.assigneeOrder || []).indexOf(u.id);
                  const isSelected = idx !== -1;
                  return (
                    <div key={u.id} onClick={() => toggleUserInOrder(u.id)} className={`relative flex-none w-14 h-14 rounded-full border-[3px] cursor-pointer transition-all ${isSelected ? 'border-[#28C8C8] ring-4 ring-[#28C8C8]/20 scale-105' : 'border-gray-200 grayscale opacity-50 hover:opacity-80'}`}>
                      <img src={u.avatar} className="w-full h-full rounded-full object-cover"/>
                      {isSelected && <div className="absolute -top-2 -right-2 w-6 h-6 bg-[#28C8C8] text-white text-xs font-bold flex items-center justify-center rounded-full shadow-md z-10 border-2 border-white">{idx + 1}</div>}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
                <label htmlFor="start-date" className="text-sm font-bold text-gray-600 ml-1">排班起始日</label>
                <input type="date" id="start-date" name="startDate" value={configForm.nextDate} onChange={e => setConfigForm({...configForm, nextDate:e.target.value})} className="w-full h-14 px-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold outline-none focus:border-[#28C8C8] text-lg text-gray-700 transition-colors"/>
            </div>

            <button onClick={saveConfig} disabled={isSaving} className="w-full py-4 bg-[#28C8C8] hover:bg-[#20a0a0] text-white rounded-2xl font-bold text-xl shadow-xl shadow-[#28C8C8]/30 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2">{isSaving ? '儲存中...' : '儲存規則'}</button>
          </div>
        </div>
      )}

      {alertMsg && (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-6 backdrop-blur-sm" onClick={() => setAlertMsg(null)}>
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 text-center animate-in zoom-in-95 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 text-[#28C8C8] flex justify-center"><CheckCircle2 size={48}/></div>
            <h3 className="font-bold text-gray-800 mb-6 text-lg">{alertMsg}</h3>
            <button onClick={() => setAlertMsg(null)} className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-gray-700 transition-colors">知道了</button>
          </div>
        </div>
      )}
    </div>
  );
}