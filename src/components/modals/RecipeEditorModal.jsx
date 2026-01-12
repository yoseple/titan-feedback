{/* FOOD SEARCH MODAL (Overlay) */}
{isFoodSearching && editingMeal && (
  <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
     <div className="bg-slate-800 w-full sm:max-w-md h-[80vh] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-700 animate-in slide-in-from-bottom-10">
        <div className="p-4 bg-slate-900 border-b border-slate-700 flex gap-2 items-center">
            <Scan className="text-gray-500" size={20}/>
            <input 
                autoFocus 
                type="text" 
                placeholder="Search USDA Database..." 
                className="flex-1 bg-slate-800 text-white px-2 py-2 outline-none text-lg" 
                value={editorSearchQuery} 
                onChange={e=>setEditorSearchQuery(e.target.value)} 
                onKeyDown={e => {
                    if (e.key === 'Enter') {
                        e.preventDefault(); // Prevent page refresh
                        handleEditorSearch();
                    }
                }}
            />
            <button 
                onClick={handleEditorSearch} 
                disabled={isEditorSearching}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm min-w-[60px] flex items-center justify-center"
            >
                {isEditorSearching ? <Loader className="w-4 h-4 animate-spin"/> : 'Go'}
            </button>
            <button onClick={() => setIsFoodSearching(false)} className="text-gray-400 p-2"><X size={24}/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {isEditorSearching ? (
                <div className="flex flex-col items-center justify-center h-48 space-y-3">
                    <Loader className="w-8 h-8 animate-spin text-emerald-500" />
                    <span className="text-gray-500 text-sm">Searching USDA...</span>
                </div>
            ) : editorSearchResults.length > 0 ? (
                editorSearchResults.map(food => (
                    <button key={food.id} onClick={() => addIngredientToEditor(food)} className="w-full text-left p-4 bg-slate-700/30 hover:bg-slate-700 rounded-xl flex justify-between items-center active:scale-95 transition border border-white/5">
                        <div>
                            <div className="font-bold text-white text-sm">{food.name}</div>
                            <div className="text-xs text-gray-400 mt-1">{food.weight_amount}</div>
                        </div>
                        <div className="text-right text-emerald-500 font-bold text-sm bg-emerald-500/10 px-2 py-1 rounded-lg">
                            {food.calories} Cal
                        </div>
                    </button>
                ))
            ) : (
                <div className="text-center text-gray-500 mt-10">
                    {editorSearchQuery ? "No results found." : "Type a food name to search."}
                </div>
            )}
        </div>
     </div>
  </div>
)}