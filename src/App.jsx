import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, serverTimestamp, update, onValue, remove } from "firebase/database";
import { 
  Plus, Home, ChevronRight, Users, CheckCircle2, 
  Wallet, Settings, History, LogOut, Loader2, X, 
  CalendarDays, List, ChevronLeft, Edit2, Trash2, Send, ChevronDown, Calendar
} from 'lucide-react';

// --- 配置區 ---
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

// --- 工具函式 ---
const getTodayString = () => new Date().toISOString().split('T')[0];
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [myGroups, setMyGroups] = useState([]);
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [groupData, setGroupData] = useState(null);
  
  const [view, setView] = useState('roster'); 
  const [rosterMode, setRosterMode] = useState('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  // 日曆與編輯狀態
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(getTodayString());
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editingConfig, setEditingConfig] = useState({ 
    name: '', price: 50, freq: 7, icon: '🧹', 
    firstAssignee: '', startDate: getTodayString() 
  });

  useEffect(() => {
    const loadLiffSDK = () => {
      return new Promise((resolve) => {
        if (window.liff) return resolve(window.liff);
        const script = document.createElement('script');
        script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
        script.async = true;
        script.onload = () => resolve(window.liff);
        document.head.appendChild(script);
      });
    };

    const startApp = async () => {
      try {
        const liff = await loadLiffSDK();
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) { liff.login(); return; }
        const profile = await liff.getProfile();
        setUser({ id: profile.userId, name: profile.displayName, avatar: profile.pictureUrl });
        
        setMyGroups(JSON.parse(localStorage.getItem('roomie_history') || '[]'));

        const params = new URLSearchParams(window.location.search);
        const gId = params.get('g');
        if (gId) {
          await loadGroup(gId, profile.userId, profile.displayName, profile.pictureUrl);
        } else {
          setLoading(false);
        }
      } catch (err) { setLoading(false); }
    };
    startApp();

    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadGroup = async (gId, uId, uName, uAvatar) => {
    const groupRef = ref(db, `groups/${gId}`);
    const snapshot = await get(groupRef);
    if (snapshot.exists()) {
      const data = snapshot.val();
      setGroupData(data);
      setCurrentGroupId(gId);
      
      const history = JSON.parse(localStorage.getItem('roomie_history') || '[]');
      if (!history.find(h => h.id === gId)) {
        const newHistory = [{ id: gId, name: data.name || '未命名空間' }, ...history].slice(0, 5);
        localStorage.setItem('roomie_history', JSON.stringify(newHistory));
        setMyGroups(newHistory);
      }
      if (!data.members || !data.members[uId]) {
        await update(ref(db, `groups/${gId}/members/${uId}`), { id: uId, name: uName, avatar: uAvatar, balance: 0 });
      }
      onValue(groupRef, (snap) => setGroupData(snap.val()));
      setLoading(false);
    } else {
      window.location.href = `https://liff.line.me/${LIFF_ID}`;
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setLoading(true);
    const newId = `g-${Math.random().toString(36).substr(2, 9)}`;
    try {
      await set(ref(db, `groups/${newId}`), {
        id: newId, name: newGroupName, createdAt: serverTimestamp(),
        members: { [user.id]: { id: user.id, name: user.name, avatar: user.avatar, balance: 0 } },
        logs: [{ time: new Date().toLocaleString(), msg: `🏠 ${user.name} 建立了空間` }]
      });
      window.location.href = `https://liff.line.me/${LIFF_ID}?g=${newId}`;
    } catch (e) { alert("建立失敗"); setLoading(false); }
  };

  const handleShare = async () => {
    if (!window.liff) return;
    const link = `https://liff.line.me/${LIFF_ID}?g=${currentGroupId}`;
    if (window.liff.isApiAvailable('shareTargetPicker')) {
      try {
        await window.liff.shareTargetPicker([{
          type: "text",
          text: `🏠 邀請你加入空間「${groupData.name}」！\n點擊連結加入：\n${link}`
        }]);
      } catch (error) { console.error("分享取消"); }
    } else {
      navigator.clipboard.writeText(link);
      alert("連結已複製");
    }
  };

  const saveTaskConfig = async () => {
    if (!editingConfig.name || !editingConfig.firstAssignee) {
      alert("請完整填寫家事名稱與負責人");
      return;
    }
    const cfgId = `cfg-${Date.now()}`;
    const taskId = `task-${Date.now()}`;
    
    const newConfig = { ...editingConfig, id: cfgId };
    
    // 同時建立規則與第一個任務
    const updates = {};
    updates[`groups/${currentGroupId}/configs/${cfgId}`] = newConfig;
    updates[`groups/${currentGroupId}/tasks/${taskId}`] = {
      id: taskId,
      configId: cfgId,
      name: editingConfig.name,
      icon: editingConfig.icon,
      price: editingConfig.price,
      date: editingConfig.startDate,
      assigneeId: editingConfig.firstAssignee,
      status: 'pending'
    };
    updates[`groups/${currentGroupId}/logs/${Date.now()}`] = {
      time: new Date().toLocaleString(),
      msg: `📝 ${user.name} 新增了家事「${editingConfig.name}」`
    };

    await update(ref(db), updates);
    setIsEditingConfig(false);
    setEditingConfig({ name: '', price: 50, freq: 7, icon: '🧹', firstAssignee: '', startDate: getTodayString() });
  };

  if (loading) return (
    <div className="flex h-[100dvh] flex-col items-center justify-center bg-white">
      <Loader2 className="animate-spin text-cyan-500 mb-4" size={40} />
      <p className="text-gray-400 text-sm font-bold animate-pulse">連線中...</p>
    </div>
  );

  if (!currentGroupId) return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col">
      <div className="p-8 bg-white border-b shadow-sm">
        <h1 className="text-2xl font-bold text-gray-800">嗨，{user?.name}</h1>
        <p className="text-gray-500 text-sm">選擇空間或建立一個新的</p>
      </div>
      <div className="flex-1 p-6 space-y-4">
        {myGroups.map(g => (
          <div key={g.id} onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}?g=${g.id}`}
               className="bg-white p-5 rounded-3xl border flex justify-between items-center shadow-sm active:bg-gray-50 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center text-cyan-600"><Home size={24}/></div>
              <span className="font-bold text-gray-700">{g.name}</span>
            </div>
            <ChevronRight className="text-gray-300" />
          </div>
        ))}
      </div>
      <div className="p-6 bg-white border-t"><button onClick={() => setShowCreateModal(true)} className="w-full py-4 bg-cyan-500 text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2"><Plus size={20}/> 建立新空間</button></div>
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-white w-full max-w-md rounded-[32px] p-8 space-y-6">
            <h3 className="font-bold text-xl">新空間命名</h3>
            <input autoFocus type="text" placeholder="我的溫馨小家" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full p-4 bg-gray-100 rounded-2xl border-none focus:ring-2 focus:ring-cyan-500 outline-none" />
            <button onClick={handleCreateGroup} className="w-full py-4 bg-cyan-500 text-white rounded-2xl font-bold">確認建立</button>
            <button onClick={() => setShowCreateModal(false)} className="w-full text-gray-400 text-sm">取消</button>
          </div>
        </div>
      )}
    </div>
  );

  const tasks = groupData?.tasks ? Object.values(groupData.tasks) : [];

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col pb-24 overflow-hidden relative">
      <header className="p-4 bg-white border-b flex justify-between items-center sticky top-0 z-30">
        <h2 className="font-extrabold text-gray-800 truncate text-lg">{groupData?.name}</h2>
        <div className="relative" ref={userMenuRef}>
          <div onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-1 cursor-pointer active:scale-95 transition-transform">
            <img src={user?.avatar} className="w-8 h-8 rounded-full border shadow-sm" alt="me" />
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
          </div>
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
              <button onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}`} className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <Home size={16} className="text-cyan-500"/> 我的群組
              </button>
              <div className="border-t border-gray-50 my-1"></div>
              <button onClick={() => { if(window.confirm("退出群組？")) window.location.href = `https://liff.line.me/${LIFF_ID}`; }} className="w-full px-4 py-3 text-left text-sm text-red-500 hover:bg-red-50 flex items-center gap-2">
                <LogOut size={16}/> 退出群組
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="p-4 flex-1">
        {view === 'roster' && (
          <div className="space-y-4">
            <div className="flex bg-gray-200 p-1 rounded-xl">
              <button onClick={() => setRosterMode('list')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${rosterMode === 'list' ? 'bg-white text-cyan-600 shadow-sm' : 'text-gray-500'}`}>清單模式</button>
              <button onClick={() => setRosterMode('calendar')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${rosterMode === 'calendar' ? 'bg-white text-cyan-600 shadow-sm' : 'text-gray-500'}`}>日曆模式</button>
            </div>
            
            {rosterMode === 'list' ? (
              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <div className="bg-white rounded-3xl border p-12 flex flex-col items-center justify-center text-gray-400 space-y-3">
                    <CheckCircle2 size={48} className="opacity-10" />
                    <p className="text-sm font-bold">目前無任務</p>
                  </div>
                ) : tasks.map(t => (
                  <div key={t.id} className="bg-white p-4 rounded-2xl border flex justify-between items-center shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{t.icon}</span>
                      <div>
                        <p className="font-bold text-gray-800">{t.name}</p>
                        <p className="text-[10px] text-gray-400">{t.date} · {groupData?.members?.[t.assigneeId]?.name}</p>
                      </div>
                    </div>
                    {t.status === 'pending' && <button className="text-xs bg-cyan-500 text-white px-3 py-1.5 rounded-lg font-bold">完成</button>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-3xl border p-6">
                <div className="flex justify-between items-center mb-6">
                  <ChevronLeft onClick={() => setCalendarMonth(new Date(calendarMonth.setMonth(calendarMonth.getMonth() - 1)))}/>
                  <span className="font-bold">{calendarMonth.getFullYear()} / {calendarMonth.getMonth() + 1}</span>
                  <ChevronRight onClick={() => setCalendarMonth(new Date(calendarMonth.setMonth(calendarMonth.getMonth() + 1)))}/>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                   {['日','一','二','三','四','五','六'].map(d => <div key={d} className="text-[10px] text-gray-400 mb-2">{d}</div>)}
                   {Array.from({ length: getDaysInMonth(calendarMonth.getFullYear(), calendarMonth.getMonth()) + getFirstDayOfMonth(calendarMonth.getFullYear(), calendarMonth.getMonth()) }).map((_, i) => {
                     const first = getFirstDayOfMonth(calendarMonth.getFullYear(), calendarMonth.getMonth());
                     if (i < first) return <div key={i} />;
                     const day = i - first + 1;
                     const dStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                     const hasTask = tasks.some(t => t.date === dStr);
                     return (
                       <div key={i} onClick={() => setCalendarSelectedDate(dStr)} className={`aspect-square flex flex-col items-center justify-center text-sm rounded-lg relative ${dStr === calendarSelectedDate ? 'bg-cyan-500 text-white font-bold' : 'text-gray-700'}`}>
                         {day}
                         {hasTask && <div className={`w-1 h-1 rounded-full mt-0.5 ${dStr === calendarSelectedDate ? 'bg-white' : 'bg-cyan-500'}`} />}
                       </div>
                     )
                   })}
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-4">
            <div className="bg-cyan-500 p-8 rounded-[40px] text-white shadow-xl shadow-cyan-100">
              <p className="opacity-70 text-sm font-bold">我的結餘</p>
              <h1 className="text-5xl font-bold font-mono">NT$ {groupData?.members?.[user.id]?.balance || 0}</h1>
            </div>
            <div className="bg-white rounded-3xl border divide-y overflow-hidden">
              {groupData?.members && Object.values(groupData.members).map(m => (
                <div key={m.id} className="p-4 flex justify-between items-center font-bold">
                  <div className="flex items-center gap-3"><img src={m.avatar} className="w-10 h-10 rounded-full border"/><span className="text-gray-700">{m.name}</span></div>
                  <span className={m.balance >= 0 ? 'text-cyan-600' : 'text-red-500'}>${m.balance}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-4">
             <div className="bg-white rounded-3xl border p-4 shadow-sm flex items-center justify-between">
                <div className="flex -space-x-2">
                  {groupData?.members && Object.values(groupData.members).map(m => <img key={m.id} src={m.avatar} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" />)}
                </div>
                <button onClick={handleShare} className="text-xs text-cyan-500 font-bold bg-cyan-50 px-4 py-2 rounded-full flex items-center gap-1 active:scale-95 transition-all"><Plus size={14}/> 邀請室友</button>
             </div>
             <div className="bg-white rounded-3xl border p-6 space-y-6">
                <h3 className="font-bold text-gray-700 flex items-center gap-2"><History size={18}/> 最新動態</h3>
                <div className="space-y-6">
                  {groupData?.logs?.slice(-10).reverse().map((log, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full mt-1.5 shrink-0" />
                      <div><p className="text-[10px] text-gray-400 font-mono mb-1">{log.time}</p><p className="text-sm text-gray-800 leading-snug">{log.msg}</p></div>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-3xl border shadow-sm flex items-center justify-between">
                <div className="flex -space-x-2">
                  {groupData?.members && Object.values(groupData.members).map(m => <img key={m.id} src={m.avatar} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" />)}
                </div>
                <button onClick={handleShare} className="text-xs text-cyan-500 font-bold bg-cyan-50 px-4 py-2 rounded-full flex items-center gap-1"><Plus size={14}/> 邀請室友</button>
            </div>
            <div className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-gray-800">家事設定</h3>
                <div className="flex gap-2">
                  <button onClick={() => setIsEditingConfig(true)} className="text-cyan-500 font-bold text-xs bg-cyan-50 px-3 py-1.5 rounded-full">+ 新增</button>
                  <button className="text-gray-400 bg-gray-50 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1"><Edit2 size={12}/> 編輯</button>
                </div>
              </div>
              <div className="space-y-3">
                {groupData?.configs ? Object.values(groupData.configs).map(cfg => (
                  <div key={cfg.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="flex items-center gap-3"><span className="text-2xl">{cfg.icon}</span><div><p className="font-bold text-sm">{cfg.name}</p><p className="text-[10px] text-gray-400">每 {cfg.freq} 天 / ${cfg.price}</p></div></div>
                    <Trash2 size={16} className="text-gray-300 cursor-pointer" onClick={() => remove(ref(db, `groups/${currentGroupId}/configs/${cfg.id}`))} />
                  </div>
                )) : <p className="text-center py-4 text-gray-300 text-xs italic">尚未設定家事</p>}
              </div>
            </div>
          </div>
        )}
      </main>

      {isEditingConfig && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 space-y-5 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center"><h3 className="font-black text-xl text-gray-800">新增家事</h3><X onClick={() => setIsEditingConfig(false)} className="text-gray-400 cursor-pointer" /></div>
            <div className="space-y-4">
              <input type="text" placeholder="家事名稱 (例如：掃地)" value={editingConfig.name} onChange={e => setEditingConfig({...editingConfig, name: e.target.value})} className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-cyan-500" />
              <div className="flex gap-3">
                <input type="text" placeholder="圖示" value={editingConfig.icon} onChange={e => setEditingConfig({...editingConfig, icon: e.target.value})} className="w-20 p-4 bg-gray-50 rounded-2xl text-center text-xl outline-none" />
                <input type="number" placeholder="賞金" defaultValue="50" onChange={e => setEditingConfig({...editingConfig, price: Number(e.target.value) || 50})} className="flex-1 p-4 bg-gray-50 rounded-2xl font-bold outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 ml-1">由誰開始</label>
                  <select className="w-full p-3 bg-gray-50 rounded-xl text-sm outline-none appearance-none" onChange={e => setEditingConfig({...editingConfig, firstAssignee: e.target.value})}>
                    <option value="">選擇成員</option>
                    {Object.values(groupData.members).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 ml-1">從何時開始</label>
                  <input type="date" value={editingConfig.startDate} onChange={e => setEditingConfig({...editingConfig, startDate: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl text-sm outline-none" />
                </div>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl">
                <span className="text-sm text-gray-500">每</span>
                <input type="number" defaultValue="7" className="w-16 bg-white p-2 rounded-lg text-center font-bold text-cyan-600 shadow-sm" onChange={e => setEditingConfig({...editingConfig, freq: Number(e.target.value) || 7})} />
                <span className="text-sm text-gray-500">天一次</span>
              </div>
            </div>
            <button onClick={saveTaskConfig} className="w-full py-4 bg-cyan-500 text-white rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-all">儲存家事</button>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t flex justify-around p-3 max-w-md mx-auto z-20">
        {[ {id:'roster', icon:CheckCircle2, lab:'值日表'}, {id:'wallet', icon:Wallet, lab:'帳本'}, {id:'history', icon:History, lab:'動態'}, {id:'settings', icon:Settings, lab:'設定'} ].map(n => (
          <button key={n.id} onClick={() => setView(n.id)} className={`flex flex-col items-center p-2 rounded-2xl transition-all ${view === n.id ? 'text-cyan-600' : 'text-gray-400'}`}><n.icon size={22} /><span className="text-[10px] mt-1 font-bold">{n.lab}</span></button>
        ))}
      </nav>
    </div>
  );
}