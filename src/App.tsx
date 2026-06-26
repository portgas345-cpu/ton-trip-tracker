import { useState, useEffect } from 'react';
import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  setDoc,
  query,
  orderBy
} from 'firebase/firestore';

interface Expense {
  id: string;
  description: string;
  amount: number;
  currency: 'THB' | 'LAK';
  paidBy: string;
  createdAt: any;
}

function App() {
  const [tripTitle, setTripTitle] = useState('กำลังโหลด...');
  const [participants, setParticipants] = useState<string[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(600);
  
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    currency: 'LAK' as 'THB' | 'LAK',
    paidBy: ''
  });
  const [newParticipant, setNewParticipant] = useState('');
  const [error, setError] = useState<string | null>(null);

  // --- [PREMIUM EXTRA] Active Tab State ---
  const [activeTab, setActiveTab] = useState<'dashboard' | 'add_expense' | 'settings'>('dashboard');

  // --- [PREMIUM EXTRA] Share Copied Status ---
  const [copied, setCopied] = useState(false);

  // --- Dynamic TRIP_ID from URL Hash ---
  const [tripId, setTripId] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return hash || 'main_trip';
  });

  // Listen for hash changes so the page updates if the user changes the URL
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      setTripId(hash || 'main_trip');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // --- Real-time Sync ---
  useEffect(() => {
    setError(null);
    setTripTitle('กำลังโหลด...');
    
    // Path: trips/{tripId}/settings/data
    const settingsDoc = doc(db, 'trips', tripId, 'config', 'settings');
    const unsubSettings = onSnapshot(settingsDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setTripTitle(data.title || `ทริป ${tripId}`);
        setExchangeRate(data.rate || 600);
        setParticipants(data.participants || ['ฉัน']);
      } else {
        setDoc(settingsDoc, { 
          title: tripId === 'main_trip' ? 'ทริปของฉัน 🇱🇦' : `ทริป ${tripId}`, 
          rate: 600, 
          participants: ['ฉัน'] 
        }).catch(err => setError("Firebase Error: " + err.message));
      }
    }, (err) => setError("Sync Error: " + err.message));

    // Path: trips/{tripId}/expenses
    const expensesCol = collection(db, 'trips', tripId, 'expenses');
    const q = query(expensesCol, orderBy('createdAt', 'desc'));
    const unsubExpenses = onSnapshot(q, (snapshot) => {
      const exps: Expense[] = [];
      snapshot.forEach((doc) => {
        exps.push({ id: doc.id, ...doc.data() } as Expense);
      });
      setExpenses(exps);
    }, (err) => setError("Expenses Sync Error: " + err.message));

    return () => {
      unsubSettings();
      unsubExpenses();
    };
  }, [tripId]);

  // --- Calculations ---
  const convertToTHB = (amount: number, currency: 'THB' | 'LAK') => {
    if (currency === 'THB') return amount;
    return amount / exchangeRate;
  };

  const convertToLAK = (amount: number, currency: 'THB' | 'LAK') => {
    if (currency === 'LAK') return amount;
    return amount * exchangeRate;
  };

  const totalSpentTHB = expenses.reduce((sum, exp) => sum + convertToTHB(exp.amount, exp.currency), 0);
  const costPerPerson = participants.length > 0 ? totalSpentTHB / participants.length : 0;

  const settlements = participants.map(name => {
    const paidByThisPerson = expenses
      .filter(exp => exp.paidBy === name)
      .reduce((sum, exp) => sum + convertToTHB(exp.amount, exp.currency), 0);
    
    const balance = paidByThisPerson - costPerPerson;
    return { name, balance };
  });

  // --- Handlers ---
  const updateSettings = async (newData: any) => {
    try {
      const settingsDoc = doc(db, 'trips', tripId, 'config', 'settings');
      await setDoc(settingsDoc, newData, { merge: true });
      setError(null);
    } catch (err: any) {
      setError("Update Settings Error: " + err.message);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount || !newExpense.paidBy) return;

    try {
      const expensesCol = collection(db, 'trips', tripId, 'expenses');
      await addDoc(expensesCol, {
        description: newExpense.description,
        amount: parseFloat(newExpense.amount),
        currency: newExpense.currency,
        paidBy: newExpense.paidBy,
        createdAt: new Date()
      });
      setNewExpense({ ...newExpense, description: '', amount: '' });
      setError(null);
      // Automatically switch back to Dashboard after adding
      setActiveTab('dashboard');
    } catch (err: any) {
      setError("Add Expense Error: " + err.message);
    }
  };

  const removeExpense = async (id: string) => {
    if (confirm('ยืนยันที่จะลบรายการค่าใช้จ่ายนี้?')) {
      try {
        const expDoc = doc(db, 'trips', tripId, 'expenses', id);
        await deleteDoc(expDoc);
        setError(null);
      } catch (err: any) {
        setError("Delete Error: " + err.message);
      }
    }
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParticipant || participants.includes(newParticipant)) return;
    const updated = [...participants, newParticipant];
    await updateSettings({ participants: updated });
    setNewParticipant('');
  };

  const removeParticipant = async (name: string) => {
    if (confirm(`ต้องการลบ ${name} ออกใช่หรือไม่? รายการที่ ${name} จ่ายจะยังคงอยู่`)) {
      const updated = participants.filter(p => p !== name);
      await updateSettings({ participants: updated });
    }
  };

  const handleReset = async () => {
    if (confirm('ต้องการล้างข้อมูลทั้งหมดใช่หรือไม่? (ลบรายการจ่ายทั้งหมด)')) {
      try {
        for (const exp of expenses) {
          const expDoc = doc(db, 'trips', tripId, 'expenses', exp.id);
          await deleteDoc(expDoc);
        }
        await updateSettings({ 
          title: tripId === 'main_trip' ? 'ทริปของฉัน 🇱🇦' : `ทริป ${tripId}`, 
          rate: 600, 
          participants: ['ฉัน'] 
        });
        setError(null);
        setActiveTab('dashboard');
      } catch (err: any) {
        setError("Reset Error: " + err.message);
      }
    }
  };

  // --- [PREMIUM EXTRA] Copy URL Link Handler ---
  const handleCopyLink = () => {
    const shareableUrl = window.location.origin + window.location.pathname + '#' + tripId;
    navigator.clipboard.writeText(shareableUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => {
        setError("ไม่สามารถคัดลอกลิงก์ได้");
      });
  };

  const formatTHB = (val: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(val);
  const formatLAK = (val: number) => new Intl.NumberFormat('lo-LA', { style: 'decimal' }).format(Math.round(val)) + ' ₭';

  return (
    <div className="container">
      {/* Error Alert */}
      {error && (
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid rgba(224, 90, 71, 0.2)', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><strong>เกิดข้อผิดพลาด: </strong> {error}</span>
          <span style={{ cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setError(null)}>×</span>
        </div>
      )}

      {/* Modern Header */}
      <header>
        <span className="room-badge">
          🌐 ROOM ID: {tripId}
        </span>
        <input 
          className="title-input"
          value={tripTitle} 
          onChange={(e) => updateSettings({ title: e.target.value })} 
          placeholder="ตั้งชื่อทริปของคุณ..."
        />
        <p>เครื่องมือคำนวณค่าใช้จ่ายเรียลไทม์ 🇱🇦✨</p>
      </header>

      {/* [PREMIUM EXTRA] Share Trip Link Widget */}
      <div className="share-widget">
        <div className="share-info">
          <h4>ชวนเพื่อนเข้ามาร่วมจดแบบเรียลไทม์</h4>
          <p>เพียงแค่ส่งลิงก์ห้องนี้ให้เพื่อนๆ</p>
        </div>
        <button className="share-btn" onClick={handleCopyLink}>
          {copied ? 'คัดลอกสำเร็จ! ✔️' : '🔗 แชร์ลิงก์ทริป'}
        </button>
      </div>

      {/* [PREMIUM EXTRA] Modern Tab Bar Navigation */}
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <span className="tab-icon">📊</span>
          <span>แดชบอร์ด</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'add_expense' ? 'active' : ''}`}
          onClick={() => setActiveTab('add_expense')}
        >
          <span className="tab-icon">💸</span>
          <span>บันทึกจ่าย</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <span className="tab-icon">⚙️</span>
          <span>ตั้งค่าทริป</span>
        </button>
      </div>

      {/* ==================== TAB 1: DASHBOARD ==================== */}
      {activeTab === 'dashboard' && (
        <div>
          {/* Summary Cards */}
          <div className="summary-grid">
            <div className="summary-item total-spent">
              <span className="summary-value">{formatTHB(totalSpentTHB)}</span>
              <label>💵 รวมค่าใช้จ่ายทั้งหมด</label>
            </div>
            <div className="summary-item per-person">
              <span className="summary-value">{formatTHB(costPerPerson)}</span>
              <label>👥 ตกเฉลี่ยต่อคน</label>
            </div>
          </div>

          {/* Settlements List */}
          <div className="card">
            <h2>🤝 สรุปยอดเฉลี่ยหารลงตัว (สรุปใครจ่ายใคร)</h2>
            <div style={{ marginTop: '12px' }}>
              {settlements.map(s => {
                const isGetBack = s.balance >= 0;
                return (
                  <div key={s.name} className={`settlement-item ${isGetBack ? 'get-back' : 'owe'}`}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span className="settlement-avatar">
                        {s.name.charAt(0).toUpperCase()}
                      </span>
                      <strong>{s.name}</strong>
                    </div>
                    <div>
                      {isGetBack 
                        ? `ได้รับคืน ${formatTHB(s.balance)}` 
                        : `ต้องจ่ายเพิ่ม ${formatTHB(Math.abs(s.balance))}`
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* History in Dashboard (Keep historical tracking easy to read) */}
          <div className="card">
            <h2>📜 ประวัติค่าใช้จ่ายทั้งหมด ({expenses.length} รายการ)</h2>
            {expenses.length === 0 ? (
              <p style={{ color: 'var(--text-light)', textAlign: 'center', padding: '24px 0', fontSize: '0.9rem' }}>
                ยังไม่มีรายการบันทึกค่าใช้จ่ายในตอนนี้ กดที่แท็บ "บันทึกจ่าย" เพื่อเพิ่มได้เลย!
              </p>
            ) : (
              <div className="expense-list" style={{ marginTop: '12px' }}>
                {expenses.map(exp => {
                  const amtTHB = convertToTHB(exp.amount, exp.currency);
                  const amtLAK = convertToLAK(exp.amount, exp.currency);
                  return (
                    <div key={exp.id} className="expense-item">
                      <div className="expense-info">
                        <div className="expense-avatar">
                          {exp.paidBy.charAt(0).toUpperCase()}
                        </div>
                        <div className="expense-details">
                          <span className="expense-meta">{exp.description}</span>
                          <span className="expense-sub">จ่ายโดย {exp.paidBy}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div className="expense-amount-box">
                          <div className="expense-amount">
                            {exp.currency === 'THB' ? formatTHB(exp.amount) : formatLAK(exp.amount)}
                          </div>
                          <div className="expense-convert">
                            {exp.currency === 'THB' ? `≈ ${formatLAK(amtLAK)}` : `≈ ${formatTHB(amtTHB)}`}
                          </div>
                        </div>
                        <button className="delete-btn" onClick={() => removeExpense(exp.id)} title="ลบรายการ">
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 2: ADD EXPENSE ==================== */}
      {activeTab === 'add_expense' && (
        <div className="card">
          <h2>✍️ บันทึกรายการจ่ายใหม่</h2>
          <form onSubmit={handleAddExpense} style={{ marginTop: '16px' }}>
            <div className="form-group">
              <label>📝 รายการค่าใช้จ่าย</label>
              <input 
                placeholder="เช่น ค่าเฝอหลวงพระบาง, ค่าซิมการ์ด, ค่ารถไฟความเร็วสูง" 
                value={newExpense.description}
                onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                required
              />
            </div>
            <div className="form-group" style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 2 }}>
                <label>💰 จำนวนเงินที่จ่าย</label>
                <input 
                  type="number" 
                  step="any"
                  placeholder="0.00" 
                  value={newExpense.amount}
                  onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                  required
                />
              </div>
              <div style={{ flex: 1.2 }}>
                <label>💵 สกุลเงิน</label>
                <select 
                  value={newExpense.currency}
                  onChange={e => setNewExpense({...newExpense, currency: e.target.value as 'THB' | 'LAK'})}
                >
                  <option value="LAK">กีบ (LAK)</option>
                  <option value="THB">บาท (THB)</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>👤 ใครเป็นคนออกเงินก่อน?</label>
              <select 
                value={newExpense.paidBy}
                onChange={e => setNewExpense({...newExpense, paidBy: e.target.value})}
                required
              >
                <option value="">เลือกรายชื่อผู้จ่าย...</option>
                {participants.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <button type="submit" style={{ marginTop: '10px' }}>
              💾 บันทึกและคำนวณเงินทันที
            </button>
          </form>
        </div>
      )}

      {/* ==================== TAB 3: SETTINGS ==================== */}
      {activeTab === 'settings' && (
        <div>
          {/* Exchange Rate & Basic Info */}
          <div className="card">
            <h2>🛠️ ตั้งค่าเรทและข้อมูลทริป</h2>
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label>📈 อัตราแลกเปลี่ยน (1 บาทไทย = ? กีบลาว)</label>
              <input 
                type="number" 
                value={exchangeRate} 
                onChange={(e) => updateSettings({ rate: parseFloat(e.target.value) || 0 })} 
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '6px' }}>
                * เรทเงินโดยเฉลี่ยปัจจุบันอยู่ที่ประมาณ 600 - 750 กีบต่อบาท
              </p>
            </div>
          </div>

          {/* Participants Management */}
          <div className="card">
            <h2>👥 ผู้ร่วมทริปในห้องนี้ ({participants.length} คน)</h2>
            <div style={{ marginTop: '16px' }}>
              <div className="participant-list">
                {participants.map(p => (
                  <span key={p} className="participant-tag">
                    👤 {p} {participants.length > 1 && (
                      <span className="remove-p" onClick={() => removeParticipant(p)} title="ลบรายชื่อ">×</span>
                    )}
                  </span>
                ))}
              </div>
              <form onSubmit={handleAddParticipant} style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <input 
                  placeholder="เพิ่มชื่อสมาชิกใหม่..." 
                  value={newParticipant} 
                  onChange={(e) => setNewParticipant(e.target.value)} 
                />
                <button style={{ width: 'auto', padding: '12px 20px' }}>เพิ่มคน</button>
              </form>
            </div>
          </div>

          {/* Reset Room / Danger Zone */}
          <div className="card" style={{ borderColor: 'rgba(224, 90, 71, 0.2)', background: 'rgba(224, 90, 71, 0.02)' }}>
            <h2 style={{ color: 'var(--danger)' }}>🚨 พื้นที่อันตราย (Danger Zone)</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '8px' }}>
              ปุ่มด้านล่างจะลบประวัติธุรกรรมทั้งหมดภายในห้อง {tripId} นี้ และกู้กลับคืนไม่ได้
            </p>
            <button className="secondary-btn" onClick={handleReset}>
              ล้างข้อมูลห้องนี้ทั้งหมด
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="footer">
        DESIGNED BY <span style={{ fontWeight: 'bold', color: 'var(--secondary)' }}>Ton (ต้นนะครับ)</span> | © 2026 v.3.0.1
        <div style={{ marginTop: '6px', fontSize: '10px', opacity: 0.7 }}>
          ขับเคลื่อนด้วยพลังแห่งมรดกมรกตลาว 🇱🇦
        </div>
      </div>
    </div>
  );
}

export default App;
