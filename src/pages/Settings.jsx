import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserProfile, updateUserProfile, submitSupportTicket } from '../services/userService';
import { calculateTDEE, calculateTargetCalories } from '../utils/nutrition';
import { MessageSquare, Send, Loader, X, LogOut, Github } from 'lucide-react'; // Added Github icon

export default function Settings({ onClose }) {
  const { currentUser, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  
  // --- PROFILE STATE ---
  const [formData, setFormData] = useState({
    weight: '', age: '', gender: 'male', goal: 'maintenance', activityLevel: 'moderate'
  });
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');

  // --- TICKET STATE ---
  const [ticket, setTicket] = useState({ subject: '', message: '', type: 'feedback' });
  const [sendingTicket, setSendingTicket] = useState(false);

  // Load Data
  useEffect(() => {
    async function loadData() {
      if (!currentUser) { setLoading(false); return; }
      try {
        const data = await getUserProfile(currentUser.uid);
        if (data) {
           setFormData(prev => ({ ...prev, ...data }));
           if (data.height) {
              const totalInches = data.height / 2.54;
              setFeet(Math.floor(totalInches / 12));
              setInches(Math.round(totalInches % 12));
           }
        }
      } catch (e) {
        // Don't hang on the loading spinner forever if the profile read fails (B13).
        console.error('Failed to load profile', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [currentUser]);

  // Profile Handler
  const handleSave = async () => {
    try {
      const ftVal = parseInt(feet || 0);
      const inVal = parseInt(inches || 0);
      
      if (ftVal === 0 && inVal === 0) {
          alert("Please enter a valid height.");
          return;
      }

      const heightCm = Math.round((ftVal * 30.48) + (inVal * 2.54));
      const tdee = calculateTDEE(formData.weight, heightCm, formData.age, formData.gender, formData.activityLevel);
      const target = calculateTargetCalories(tdee, formData.goal);

      const payload = {
          ...formData,
          height: heightCm,
          tdee,
          caloriesTarget: target,
          updatedAt: new Date().toISOString()
      };

      await updateUserProfile(currentUser.uid, payload);
      alert(`Profile Updated!\nTarget: ${target} kcal`);
      if(onClose) onClose();
    } catch (e) {
      console.error(e);
      alert('Error saving profile');
    }
  };

  // Ticket Handler
  const handleTicketSubmit = async () => {
    if(!ticket.message || !ticket.subject) return alert("Please fill in all fields.");
    
    setSendingTicket(true);
    try {
      const response = await submitSupportTicket(ticket);
      
      // Check if we got a GitHub URL back
      if (response && response.url) {
        alert("Ticket Created Successfully! (Added to GitHub)");
      } else {
        alert("Ticket Received!");
      }
      
      setTicket({ ...ticket, subject: '', message: '' }); 
    } catch (err) {
      console.error(err);
      alert("Failed to send ticket. Please try again.");
    } finally {
      setSendingTicket(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-white flex items-center justify-center gap-2"><Loader className="animate-spin"/> Loading Profile...</div>;

  return (
    <div className="bg-gray-800 text-white rounded-2xl max-w-md w-full mx-auto border border-gray-700 shadow-2xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      
      {/* --- HEADER --- */}
      <div className="flex justify-between items-center p-6 border-b border-gray-700 bg-gray-900 shrink-0">
        <h2 className="text-xl font-black text-gray-100 tracking-wide">SETTINGS</h2>
        <div className="flex items-center gap-3">
            <button onClick={logout} className="p-2 text-red-400 hover:bg-red-900/20 rounded-full transition-colors" title="Logout">
                <LogOut size={20} />
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-700 hover:text-white rounded-full transition-colors">
                <X size={24} />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth">
        
        {/* --- SECTION 1: PROFILE --- */}
        <div className="space-y-5">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-700 pb-2">Body Metrics</h3>
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Weight (lbs)</label>
                    <input type="number" value={formData.weight} onChange={(e) => setFormData({...formData, weight: e.target.value})} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-emerald-500 outline-none transition-colors" placeholder="180" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Age</label>
                    <input type="number" value={formData.age} onChange={(e) => setFormData({...formData, age: e.target.value})} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-emerald-500 outline-none transition-colors" placeholder="25" />
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Height</label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input type="number" value={feet} onChange={(e) => setFeet(e.target.value)} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-emerald-500 outline-none" placeholder="5" />
                        <span className="absolute right-3 top-3 text-gray-500 text-sm font-bold">ft</span>
                    </div>
                    <div className="relative flex-1">
                        <input type="number" value={inches} onChange={(e) => setInches(e.target.value)} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-emerald-500 outline-none" placeholder="10" />
                        <span className="absolute right-3 top-3 text-gray-500 text-sm font-bold">in</span>
                    </div>
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Gender</label>
                <div className="grid grid-cols-2 gap-2">
                    {['male', 'female'].map(g => (
                        <button key={g} onClick={() => setFormData({...formData, gender: g})} className={`p-3 rounded-xl border font-bold text-sm capitalize transition-all ${formData.gender === g ? (g==='male'?'bg-blue-600 border-blue-600 text-white':'bg-pink-600 border-pink-600 text-white') : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}>
                            {g}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Activity Level</label>
                <select value={formData.activityLevel} onChange={(e) => setFormData({...formData, activityLevel: e.target.value})} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-emerald-500 outline-none">
                    <option value="sedentary">Sedentary (Desk Job)</option>
                    <option value="light">Light Activity (1-3 days)</option>
                    <option value="moderate">Moderate (3-5 days)</option>
                    <option value="active">Active (6-7 days)</option>
                    <option value="extreme">Extreme (Physical Job)</option>
                </select>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Goal</label>
                <select value={formData.goal} onChange={(e) => setFormData({...formData, goal: e.target.value})} className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-emerald-500 outline-none">
                    <option value="cut">Cut (Fat Loss)</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="bulk">Bulk (Muscle Gain)</option>
                </select>
            </div>

            <button onClick={handleSave} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-white shadow-lg shadow-emerald-900/20 active:scale-95 transition">
                Save & Recalculate
            </button>
        </div>

        {/* --- SECTION 2: SUPPORT --- */}
        <div className="space-y-4 pt-4 border-t border-gray-700">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
               <MessageSquare className="w-4 h-4 text-blue-400"/> Support & Feedback
            </h3>
            <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 space-y-3">
               <div className="flex gap-2">
                  <button onClick={()=>setTicket({...ticket, type: 'feedback'})} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg border transition-colors ${ticket.type==='feedback' ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-gray-500 hover:bg-gray-800'}`}>Feedback</button>
                  <button onClick={()=>setTicket({...ticket, type: 'bug'})} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg border transition-colors ${ticket.type==='bug' ? 'bg-red-600 border-red-600 text-white' : 'border-gray-600 text-gray-500 hover:bg-gray-800'}`}>Report Bug</button>
               </div>
               
               <input 
                 placeholder="Subject (e.g. App crashed...)" 
                 className="w-full bg-gray-800 border border-gray-600 p-3 rounded-lg text-sm text-white outline-none focus:border-blue-500 placeholder-gray-500"
                 value={ticket.subject}
                 onChange={e => setTicket({...ticket, subject: e.target.value})}
               />
               
               <textarea 
                 placeholder="Tell us the details..." 
                 className="w-full bg-gray-800 border border-gray-600 p-3 rounded-lg text-sm text-white h-24 outline-none focus:border-blue-500 resize-none placeholder-gray-500"
                 value={ticket.message}
                 onChange={e => setTicket({...ticket, message: e.target.value})}
               />
               
               <button 
                 onClick={handleTicketSubmit} 
                 disabled={sendingTicket}
                 className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-sm text-white flex justify-center items-center gap-2 disabled:opacity-50 active:scale-95 transition shadow-lg shadow-blue-900/20"
               >
                 {sendingTicket ? <Loader className="animate-spin w-4 h-4"/> : <><Send className="w-4 h-4"/> Submit Ticket</>}
               </button>
            </div>
        </div>

      </div>
    </div>
  );
}