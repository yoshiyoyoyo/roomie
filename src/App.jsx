import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp, remove, get } from "firebase/database";
import { 
  Trash2, Sparkles, Wallet, Users, CheckCircle2, Settings, Edit2, X, 
  CalendarDays, UserPlus, List, ChevronLeft, ChevronRight,
  Calendar, ChevronDown, ChevronUp, Check, Loader2, LogOut, Home, RefreshCw
} from 'lucide-react';

// ==========================================
// ⚙️ 系統設定區
// ==========================================

const LIFF_ID = "2009134573-7SuphV8b"; 

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

// ==========================================
// 🛠️ 工具函式
// ==========================================

const getTodayString = () => new Date().toISOString().split('T')[0];
const isFutureDate = (dateStr) => (dateStr && dateStr > getTodayString());
const generateGroupId = () => `rm-${Math.random().toString(36).substr(2, 9)}`;

const getSavedGroups = () => {
  try {
    const raw = localStorage.getItem('roomie_groups');
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
};

const saveGroupToLocal = (id, name) => {
  try {
    const groups = getSavedGroups();
    if (!id || !name) return;
    const existing = groups.find(g => g.id === id);
    if (!existing) {
      const newGroups = [{ id, name, lastVisited: Date.now() }, ...groups];
      localStorage.setItem('roomie_groups', JSON.stringify(newGroups.slice(0, 10)));
    } else {
      const newGroups = groups.map(g => g.id === id ? { ...g, name, lastVisited: Date.now() } : g);
      localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
    }
  } catch (e) {}
};

// ==========================================
// 📱 主應用程式
// ==========================================

export default function RoomieTaskApp() {
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState('landing'); 
  const [groupId, setGroupId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  
  const [users, setUsers] = useState([]);
  const [taskConfigs, setTaskConfigs] = useState([]);
  const [currentCycleTasks, setCurrentCycleTasks] = useState([]);
  const [logs, setLogs] = useState([]);

  const [view, setView] = useState('roster');
  const [rosterViewMode, setRosterViewMode] = useState('list');
  const [isMyTasksOpen, setIsMyTasksOpen] = useState(true);
  const [isTaskListOpen, setIsTaskListOpen] = useState(true);
  
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(getTodayString());
  const [calendarMonth, setCalendarMonth] = useState(new Date()); 
  const [myGroups, setMyGroups] = useState([]);

  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState(null);
  const [configForm, setConfigForm] = useState({
    name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: '', nextDate: getTodayString()
  });

  useEffect(() => {
    const initApp = async () => {
      try {
        // --- 核心修正：強制降級為 HTTPS Long-Polling ---
        // 這樣就不會出現 wss:// 待處理 (Pending) 的問題
        if (db._repo) {
            db._repo.repo_.forceWebSockets_ = false;
        }

        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const lineUser = {
          id: profile.userId,
          name: profile.displayName || 'LINE用戶',
          avatar: profile.pictureUrl || ''
        };
        setCurrentUser(lineUser);
        setMyGroups(getSavedGroups());

        const params = new URLSearchParams(window.location.search);
        const gId = params.get('g');

        if (gId) {
          enterGroup(gId, lineUser);
        } else {
          setViewState('landing');
          setLoading(false);
        }
      } catch (err) {
        console.error("Init Error", err);
        setLoading(false);
      }
    };
    initApp();
  }, []);

  const enterGroup = async (gId, user) => {
    if (!gId || !user) return;
    setLoading(true);
    setGroupId(gId);
    
    // 使用 get() 進行首次快速抓取，不依賴實時監聽的握手
    const groupRef = ref(db, `groups/${gId}`);
    
    try {
      const snapshot = await get(groupRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        processData(data, gId, user);
      } else {
        alert("找不到此空間，請確認網址是否正確。");
        setViewState('landing');
        setLoading(false);
        return;
      }

      // 開啟實時監聽 (這時即使 wss 慢，也會因之前的 get() 而先看到畫面)
      onValue(groupRef, (snap) => {
        const updatedData = snap.val();
        if (updatedData) processData(updatedData, gId, user);
      }, (err) => {
          console.error("監聽失敗:", err);
      });

    } catch (error) {
      console.error("Firebase 連線錯誤:", error);
      alert("連線資料庫失敗，請確認 Firebase Rules 已設為 true。");
      setLoading(false);
    }
  };

  const processData = (data, gId, user) => {
    // 安全檢查與資料清洗
    const safeUsers = data.users ? Object.values(data.users) : [];
    const safeConfigs = data.taskConfigs ? Object.values(data.taskConfigs) : [];
    const safeTasks = data.tasks ? Object.values(data.tasks) : [];
    const safeLogs = data.logs ? Object.values(data.logs) : [];

    // 防止日期 undefined 導致排序崩潰
    safeTasks.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    safeLogs.sort((a, b) => (b.id || 0) - (a.id || 0));

    setUsers(safeUsers);
    setTaskConfigs(safeConfigs);
    setCurrentCycleTasks(safeTasks);
    setLogs(safeLogs);

    const gName = data.metadata?.name || '我的空間';
    setGroupName(gName);
    saveGroupToLocal(gId, gName);
    setMyGroups(getSavedGroups());

    // 檢查用戶是否已在名單中
    if (user && user.id && (!data.users || !data.users[user.id])) {
      registerNewMember(gId, user);
    }
    
    setViewState('app');
    setLoading(false);
  };

  const handleCreateGroup = async () => {
    if (!currentUser) return;
    setLoading(true);
    const newGid = generateGroupId();
    const gName = `${currentUser.name} 的家`;
    
    try {
      await set(ref(db, `groups/${newGid}`), {
        metadata: { creator: currentUser.name, createdAt: serverTimestamp(), name: gName },
        users: { [currentUser.id]: { ...currentUser, balance: 0 } },
        logs: { [Date.now()]: { id: Date.now(), msg: `🏠 空間已建立`, type: 'info', time: new Date().toLocaleTimeString() } }
      });
      // 跳轉回帶參數的 LIFF URL
      window.location.href = `https://liff.line.me/${LIFF_ID}?g=${newGid}`;
    } catch (e) {
      alert("建立失敗，請檢查 Firebase Rules 權限。");
      setLoading(false);
    }
  };

  const registerNewMember = async (gId, user) => {
    await update(ref(db, `groups/${gId}/users/${user.id}`), {
      ...user, balance: 0, joinedAt: serverTimestamp()
    });
    addLog(gId, `👋 歡迎 ${user.name} 加入！`, 'success');
  };

  const addLog = (gId, msg, type = 'info') => {
    const logId = Date.now();
    set(ref(db, `groups/${gId}/logs/${logId}`), {
      id: logId, msg, type, time: new Date().toLocaleTimeString()
    });
  };

  const completeTask = async (task) => {
    await update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'done' });
    addLog(groupId, `✅ ${currentUser.name} 完成了 ${task.name}`, 'success');
  };

  const releaseTaskToBounty = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'open';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = null;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myBal - (task.price || 0);
    await update(ref(db), updates);
    addLog(groupId, `💸 ${currentUser.name} 釋出任務 (扣款 $${task.price})`, 'warning');
  };

  const claimBountyTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'pending';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = currentUser.id;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myBal + (task.price || 0);
    await update(ref(db), updates);
    addLog(groupId, `💰 ${currentUser.name} 接手了 ${task.name}`, 'success');
  };

  const saveConfig = async () => {
    const configId = editingConfigId || `cfg-${Date.now()}`;
    const data = { ...configForm, id: configId, freq: `每 ${configForm.freq} 天` };
    await update(ref(db), { [`groups/${groupId}/taskConfigs/${configId}`]: data });
    setIsEditingConfig(false);
    setEditingConfigId(null);
    if (!editingConfigId && confirm("已儲存規則！是否立即產生一個任務？")) {
       const tid = `task-${Date.now()}`;
       await set(ref(db, `groups/${groupId}/tasks/${tid}`), {
         id: tid, ...data, date: getTodayString(), status: 'pending', currentHolderId: data.defaultAssigneeId
       });
    }
  };

  const shareInvite = async () => {
    const link = `https://liff.line.me/${LIFF_ID}?g=${groupId}`;
    if (liff.isApiAvailable('shareTargetPicker')) {
      await liff.shareTargetPicker([{ type: "text", text: `🏠 加入「${groupName}」值日生行列：\n${link}` }]);
    } else {
      navigator.clipboard.writeText(link);
      alert("連結已複製");
    }
  };

  const handleSwitchGroup = () => { window.location.href = `https://liff.line.me/${LIFF_ID}`; };

  // ==========================================
  // 🖼️ UI 渲染
  // ==========================================

  if (loading) return (
    <div className="flex flex-col h-[100dvh] items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-[#28C8C8] mb-4" size={48} />
      <p className="text-gray-500 font-medium italic">連線資料庫中...</p>
      <button onClick={() => window.location.reload()} className="mt-8 text-xs text-blue-400 flex items-center gap-1">
        <RefreshCw size={12}/> 點此重新連線
      </button>
    </div>
  );

  if (viewState === 'landing') return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 max-w-md mx-auto border-x">
      <div className="p-8 bg-white border-b shadow-sm">
        <h1 className="text-2xl font-bold text-gray-800">👋 嗨，{currentUser?.name}</h1>
        <p className="text-gray-500 text-sm mt-1">選擇空間或建立新群組</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {myGroups.map(g => (
          <div key={g.id} onClick={() => enterGroup(g.id, currentUser)} className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center cursor-pointer active:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#28C8C8]/10 rounded-full flex items-center justify-center text-[#28C8C8]"><Home size={20}/></div>
              <div className="truncate max-w-[200px]"><h3 className="font-bold text-gray-800">{g.name}</h3></div>
            </div>
            <ChevronRight size={20} className="text-gray-300"/>
          </div>
        ))}
        {myGroups.length === 0 && <div className="text-center py-20 text-gray-400 text-sm">尚未加入任何空間</div>}
      </div>
      <div className="p-4 bg-white border-t">
        <button onClick={handleCreateGroup} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2">
          <UserPlus size={20} /> 建立新空間
        </button>
      </div>
    </div>
  );

  if (isEditingConfig) return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col max-w-md mx-auto">
      <div className="p-4 border-b flex justify-between items-center bg-gray-50">
        <h2 className="font-bold">設定規則</h2>
        <button onClick={() => setIsEditingConfig(false)}><X size={24} /></button>
      </div>
      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
        <input type="text" placeholder="名稱" value={configForm.name} onChange={e => setConfigForm({...configForm, name: e.target.value})} className="w-full p-3 border rounded-xl" />
        <div className="flex gap-2">
          <input type="text" placeholder="圖示" value={configForm.icon} onChange={e => setConfigForm({...configForm, icon: e.target.value})} className="w-20 p-3 border rounded-xl text-center" />
          <input type="number" placeholder="金額" value={configForm.price} onChange={e => setConfigForm({...configForm, price: Number(e.target.value)})} className="flex-1 p-3 border rounded-xl" />
        </div>
        <div className="flex items-center gap-2">每 <input type="number" value={configForm.freq} onChange={e => setConfigForm({...configForm, freq: Number(e.target.value)})} className="w-20 p-2 border rounded-lg text-center"/> 天一次</div>
      </div>
      <div className="p-4"><button onClick={saveConfig} className="w-full py-4 bg-[#28C8C8] text-white rounded-xl font-bold">儲存</button></div>
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50 max-w-md mx-auto border-x overflow-hidden h-[100dvh]">
      <header className="flex-none bg-white px-4 py-4 border-b flex justify-between items-center z-10">
        <div className="flex items-center gap-2" onClick={handleSwitchGroup}>
           <ChevronLeft size={24} className="text-gray-400"/>
           <h1 className="font-bold text-gray-800 text-lg truncate max-w-[150px]">{groupName}</h1>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 pr-3">
          <img src={currentUser?.avatar} className="w-6 h-6 rounded-full border border-white" />
          <span className="text-[10px] font-bold text-gray-700 truncate max-w-[60px]">{currentUser?.name}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {view === 'roster' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex bg-gray-200 p-1 rounded-xl">
              <button onClick={() => setRosterViewMode('list')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${rosterViewMode === 'list' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}>清單</button>
              <button onClick={() => setRosterViewMode('calendar')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${rosterViewMode === 'calendar' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}>日曆</button>
            </div>

            {rosterViewMode === 'list' ? (
              <>
                <div onClick={() => setIsMyTasksOpen(!isMyTasksOpen)} className="flex justify-between font-bold text-gray-700 cursor-pointer">
                  <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-[#28C8C8]"/> 我的待辦</div>
                  {isMyTasksOpen ? <ChevronUp/> : <ChevronDown/>}
                </div>
                {isMyTasksOpen && (
                  <div className="bg-white rounded-xl shadow-sm border divide-y">
                    {currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending').map(task => (
                      <div key={task.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{task.icon || '📝'}</span>
                          <div><div className="font-bold text-sm">{task.name}</div><div className="text-[10px] text-red-400 font-bold">{task.date === getTodayString() ? '今天' : task.date || '未排期'}</div></div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => releaseTaskToBounty(task)} className="px-3 py-1 bg-gray-100 text-[10px] rounded font-bold">沒空</button>
                          <button onClick={() => completeTask(task)} disabled={isFutureDate(task.date)} className={`px-3 py-1 text-[10px] rounded font-bold text-white ${isFutureDate(task.date) ? 'bg-gray-200' : 'bg-[#28C8C8]'}`}>完成</button>
                        </div>
                      </div>
                    ))}
                    {currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending').length === 0 && <div className="p-8 text-center text-gray-300 text-xs">目前沒有任務</div>}
                  </div>
                )}

                <div onClick={() => setIsTaskListOpen(!isTaskListOpen)} className="flex justify-between font-bold text-gray-700 cursor-pointer">
                  <div className="flex items-center gap-2"><Users size={18} className="text-gray-400"/> 任務列表</div>
                  {isTaskListOpen ? <ChevronUp/> : <ChevronDown/>}
                </div>
                {isTaskListOpen && (
                  <div className="bg-white rounded-xl shadow-sm border divide-y">
                    {currentCycleTasks.map(task => {
                       const isOpen = task.status === 'open';
                       const isDone = task.status === 'done';
                       const owner = users.find(u => u.id === task.currentHolderId);
                       return (
                        <div key={task.id} className={`p-4 flex items-center justify-between ${isOpen ? 'bg-red-50' : ''}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDone ? 'opacity-30' : 'bg-gray-50'}`}>{task.icon || '📝'}</div>
                            <div>
                              <div className="flex items-center gap-2"><div className={`font-bold text-sm ${isDone ? 'line-through text-gray-300' : 'text-gray-800'}`}>{task.name}</div>{isOpen && <span className="text-[8px] bg-red-500 text-white px-1 rounded animate-pulse">賞金</span>}</div>
                              <div className="text-[10px] text-gray-400">{task.date || '無日期'} · {owner ? owner.name : '徵求中'}</div>
                            </div>
                          </div>
                          {isOpen ? <button onClick={() => claimBountyTask(task)} className="bg-red-500 text-white px-2 py-1 rounded text-[10px] font-bold">接單 +${task.price || 0}</button> : isDone && <CheckCircle2 className="text-green-300" size={20}/>}
                        </div>
                       )
                    })}
                    {currentCycleTasks.length === 0 && <div className="p-8 text-center text-gray-300 text-xs">暫無任何任務紀錄</div>}
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border p-4">
                 <div className="p-4 text-center text-gray-400 text-xs italic">日曆檢視模式 (讀取中...)</div>
              </div>
            )}
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-[#28C8C8] rounded-2xl p-6 text-white shadow-lg shadow-[#28C8C8]/20">
              <div className="text-xs opacity-80">我的結餘</div>
              <div className="text-4xl font-bold font-mono">{(users.find(u => u.id === currentUser?.id)?.balance || 0)}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border divide-y">
               {users.map(u => (
                 <div key={u.id} className="p-4 flex justify-between items-center">
                   <div className="flex items-center gap-3"><img src={u.avatar} className="w-8 h-8 rounded-full"/> <span className="font-bold text-sm text-gray-700">{u.name}</span></div>
                   <span className={`font-mono font-bold ${u.balance >= 0 ? 'text-[#28C8C8]' : 'text-red-500'}`}>{u.balance > 0 ? '+' : ''}{u.balance}</span>
                 </div>
               ))}
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-4 animate-fade-in pl-4 border-l-2 border-gray-100 ml-2">
            {logs.length === 0 ? <div className="text-gray-300 text-xs">暫無動態紀錄</div> : logs.map(log => (
              <div key={log.id} className="relative pb-4">
                <div className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-white ${log.type === 'success' ? 'bg-green-500' : log.type === 'warning' ? 'bg-red-500' : 'bg-gray-400'}`}></div>
                <div className="text-xs text-gray-800">{log.msg}</div>
                <div className="text-[8px] text-gray-400">{log.time}</div>
              </div>
            ))}
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-6 animate-fade-in">
             <div className="bg-white rounded-xl p-4 shadow-sm border flex justify-between items-center">
               <div><div className="font-bold">邀請室友</div><div className="text-[10px] text-gray-400">目前: {users.length} 人</div></div>
               <button onClick={shareInvite} className="bg-[#28C8C8] text-white px-4 py-2 rounded-xl text-xs font-bold">發送連結</button>
             </div>
             <div className="bg-white rounded-xl p-4 shadow-sm border space-y-4">
                <div className="flex justify-between items-center"><div className="font-bold">家事規則</div><button onClick={() => openConfigEditor()} className="text-[10px] text-[#28C8C8] font-bold">+ 新增</button></div>
                <div className="space-y-2">
                  {taskConfigs.map(c => (
                    <div key={c.id} className="flex justify-between p-2 hover:bg-gray-50 rounded">
                      <div className="flex gap-2 items-center text-sm"><span className="text-xl">{c.icon || '📝'}</span><div><div>{c.name}</div><div className="text-[10px] text-gray-400">{c.freq} / ${c.price}</div></div></div>
                      <div className="flex gap-2"><Settings size={14} onClick={() => openConfigEditor(c)} className="text-gray-300"/><Trash2 size={14} onClick={() => remove(ref(db, `groups/${groupId}/taskConfigs/${c.id}`))} className="text-gray-300"/></div>
                    </div>
                  ))}
                  {taskConfigs.length === 0 && <div className="text-center py-4 text-gray-300 text-xs">按「+新增」設定規則</div>}
                </div>
             </div>
             <button onClick={() => { if(confirm("退出此空間？")) { handleSwitchGroup(); } }} className="w-full py-3 bg-red-50 text-red-500 rounded-xl text-xs font-bold border border-red-100 flex items-center justify-center gap-1"><LogOut size={14}/> 退出並切換空間</button>
          </div>
        )}
      </main>

      <nav className="bg-white border-t flex justify-around pb-6 pt-2 z-10 sticky bottom-0">
        {[ {id:'roster', lab:'值日表', icon:CalendarDays}, {id:'wallet', lab:'帳本', icon:Wallet}, {id:'history', lab:'動態', icon:History}, {id:'settings', lab:'設定', icon:Settings} ].map(n => (
          <button key={n.id} onClick={() => setView(n.id)} className={`flex flex-col items-center w-full py-2 ${view === n.id ? 'text-[#28C8C8]' : 'text-gray-400'}`}><n.icon size={24}/><span className="text-[10px] mt-1 font-bold">{n.lab}</span></button>
        ))}
      </nav>
    </div>
  );
}