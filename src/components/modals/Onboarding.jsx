import React, { useState } from 'react';
import { ArrowRight, Activity, Target, Ruler, Weight, User } from 'lucide-react';
import { calculateTDEE, calculateTargetCalories, computeMacroTargets } from '../../utils/nutrition';

const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [data, setData] = useState({
    weight: '',
    feet: '',
    inches: '',
    age: '',
    gender: 'male',
    activityLevel: 'moderate',
    goal: 'maintenance'
  });

  const handleNext = () => setStep(step + 1);
  
  const handleFinish = () => {
    // 1. Convert Height to CM for the backend
    const heightCm = Math.round((parseInt(data.feet || 0) * 30.48) + (parseInt(data.inches || 0) * 2.54));

    // Validate positives before computing TDEE — otherwise calculateTDEE silently falls back
    // to 180 lb / 25 y for blank/0 values, and a NEGATIVE age flips the BMR term, persisting
    // a garbage calorie/macro target on the very first profile (the B14 guard, missing here).
    const weightVal = parseFloat(data.weight);
    const ageVal = parseFloat(data.age);
    if (!(weightVal > 0) || !(ageVal > 0) || !(heightCm > 0)) {
      setError('Please enter a valid age, weight, and height.');
      return;
    }
    setError('');

    // 2. Calculate TDEE
    const tdee = calculateTDEE(data.weight, heightCm, data.age, data.gender, data.activityLevel);
    const target = calculateTargetCalories(tdee, data.goal);
    const macroTargets = computeMacroTargets(target, data.goal, data.weight);

    // 3. Save
    onComplete({
      ...data,
      height: heightCm,
      tdee,
      caloriesTarget: target,
      macroTargets,
      onboardingComplete: true
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden relative">
        {/* Progress Bar */}
        <div className="h-1 bg-gray-700 w-full">
          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }}></div>
        </div>

        <div className="p-8">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-900/30 text-blue-400 mb-4">
                  <User size={32} />
                </div>
                <h2 className="text-2xl font-black text-white">Welcome to Titan</h2>
                <p className="text-gray-400 mt-2">Let's calibrate your profile.</p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Gender</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['male', 'female'].map(g => (
                      <button key={g} onClick={() => setData({...data, gender: g})} className={`p-3 rounded-xl border font-bold capitalize ${data.gender === g ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Age</label>
                  <input type="number" value={data.age} onChange={e => setData({...data, age: e.target.value})} className="w-full bg-gray-900 border border-gray-700 p-4 rounded-xl text-white outline-none focus:border-blue-500" placeholder="Years" />
                </div>
              </div>
              <button onClick={handleNext} disabled={!(parseFloat(data.age) > 0)} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2">Next <ArrowRight size={18}/></button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-900/30 text-emerald-400 mb-4">
                  <Ruler size={32} />
                </div>
                <h2 className="text-2xl font-black text-white">Body Stats</h2>
                <p className="text-gray-400 mt-2">For accurate calorie math.</p>
              </div>

              <div className="space-y-4">
                 <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Weight (lbs)</label>
                    <input type="number" value={data.weight} onChange={e => setData({...data, weight: e.target.value})} className="w-full bg-gray-900 border border-gray-700 p-4 rounded-xl text-white outline-none focus:border-emerald-500" placeholder="180" />
                 </div>
                 
                 <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Height</label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <input type="number" value={data.feet} onChange={e => setData({...data, feet: e.target.value})} className="w-full bg-gray-900 border border-gray-700 p-4 rounded-xl text-white outline-none focus:border-emerald-500" placeholder="5" />
                        <span className="absolute right-4 top-4 text-gray-500 font-bold">ft</span>
                      </div>
                      <div className="flex-1 relative">
                        <input type="number" value={data.inches} onChange={e => setData({...data, inches: e.target.value})} className="w-full bg-gray-900 border border-gray-700 p-4 rounded-xl text-white outline-none focus:border-emerald-500" placeholder="10" />
                        <span className="absolute right-4 top-4 text-gray-500 font-bold">in</span>
                      </div>
                    </div>
                 </div>
              </div>
              <button onClick={handleNext} disabled={!(parseFloat(data.weight) > 0) || !(parseInt(data.feet) > 0)} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2">Next <ArrowRight size={18}/></button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-900/30 text-red-400 mb-4">
                  <Target size={32} />
                </div>
                <h2 className="text-2xl font-black text-white">Your Mission</h2>
                <p className="text-gray-400 mt-2">What are we training for?</p>
              </div>

              <div className="space-y-4">
                 <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Goal</label>
                    <select value={data.goal} onChange={e => setData({...data, goal: e.target.value})} className="w-full bg-gray-900 border border-gray-700 p-4 rounded-xl text-white outline-none focus:border-red-500">
                        <option value="cut">Cut (Fat Loss)</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="bulk">Bulk (Muscle Gain)</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Activity Level</label>
                    <select value={data.activityLevel} onChange={e => setData({...data, activityLevel: e.target.value})} className="w-full bg-gray-900 border border-gray-700 p-4 rounded-xl text-white outline-none focus:border-red-500">
                        <option value="sedentary">Sedentary (Desk Job)</option>
                        <option value="light">Light Activity (1-3 days)</option>
                        <option value="moderate">Moderate (3-5 days)</option>
                        <option value="active">Active (6-7 days)</option>
                        <option value="extreme">Extreme (Physical Job)</option>
                    </select>
                 </div>
              </div>
              {error && <div className="bg-red-900/40 text-red-300 text-sm p-3 rounded-lg border border-red-800">{error}</div>}
              <button onClick={handleFinish} className="w-full bg-red-600 hover:bg-red-500 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2">Launch Titan <Activity size={18}/></button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
export default Onboarding;