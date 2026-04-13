import React, { useState, useMemo } from 'react';
import { X, Box, Layers, Package, Container } from 'lucide-react';

const HierarchyBuilderModal = ({ isOpen, onClose, units }) => {
  const [selectedBaseUnitId, setSelectedBaseUnitId] = useState("");

  // Only show units that don't have a base unit as options for the base unit selector
  const baseUnitOptions = units.filter(u => !u.baseUnitId);

  // Calculate the hierarchy for the selected base unit
  const hierarchyTree = useMemo(() => {
    if (!selectedBaseUnitId) return [];

    // Find the base unit itself
    const baseUnit = units.find(u => u.id === Number(selectedBaseUnitId));
    if (!baseUnit) return [];

    // Find all children units that point to this base unit
    const children = units.filter(u => u.baseUnitId === Number(selectedBaseUnitId));

    // Combine them, ensuring the base unit has a conversionRate of 1 locally for sorting
    const allRelated = [
      { ...baseUnit, localConversionRate: 1 },
      ...children.map(c => ({ ...c, localConversionRate: Number(c.conversionRate) || 1 }))
    ];

    // Sort ascending by conversion rate to build the levels
    const sorted = allRelated.sort((a, b) => a.localConversionRate - b.localConversionRate);

    // Calculate per-parent metrics
    return sorted.map((unit, index) => {
      let perParent = 1;
      let parentName = "";
      
      if (index > 0) {
        const parent = sorted[index - 1];
        perParent = Math.round(unit.localConversionRate / parent.localConversionRate);
        parentName = parent.name;
      }

      return {
        ...unit,
        level: index,
        perParent,
        parentName
      };
    });
  }, [selectedBaseUnitId, units]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white z-50 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Packing Hierarchy Builder</h2>
            <p className="text-sm text-slate-500 mt-1">Visual representation of multi-level packaging structures</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors p-2 -mr-2 rounded-full hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1">
          {/* Base Unit Selector */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
            <label className="block text-sm font-medium text-slate-700 mb-2">Select a Foundation (Base Unit)</label>
            <select
              value={selectedBaseUnitId}
              onChange={(e) => setSelectedBaseUnitId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#F5C742]/50"
            >
              <option value="">-- Select a Base Unit --</option>
              {baseUnitOptions.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
              ))}
            </select>
          </div>

          {/* Flow Diagram */}
          {hierarchyTree.length > 0 && (
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              {[...hierarchyTree].reverse().map((node) => {
                const isBase = node.level === 0;
                const isIntermediate = node.level > 0 && node.level < hierarchyTree.length - 2 && hierarchyTree.length > 3 || (node.level > 0 && node.level < 3);
                const isMaster = !isBase && !isIntermediate;

                // Set colors based on level block from screenshot
                let bgClass = "bg-blue-50/50 border-blue-200";
                let iconColorClass = "text-blue-500";
                let baseIcon = <Box className="h-5 w-5" />;

                if (isMaster) {
                  bgClass = "bg-[#FFFDF4] border-[#F5C742]";
                  iconColorClass = "text-[#F5C742]";
                  baseIcon = <Container className="h-5 w-5" />;
                } else if (isIntermediate) {
                  bgClass = "bg-purple-50/50 border-purple-300";
                  iconColorClass = "text-purple-500";
                  baseIcon = <Package className="h-5 w-5" />;
                }

                return (
                  <div key={node.id} className="w-full max-w-md relative flex flex-col items-center group">
                    {/* Connecting Line (except top block) */}
                    {node.level !== hierarchyTree.length - 1 && (
                      <div className="absolute -top-4 left-1/2 w-[2px] h-4 bg-slate-200"></div>
                    )}

                    <div className={`w-full rounded-xl border p-4 flex items-center transition-all ${bgClass} hover:shadow-md`}>
                      <div className={`mr-4 flex-shrink-0 ${iconColorClass}`}>
                        {baseIcon}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-lg">{node.name}</h3>
                          <span className="inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-medium border-slate-300 bg-white text-slate-600 font-mono tracking-wider">
                            {node.symbol}
                          </span>
                        </div>
                        
                        {!isBase ? (
                          <p className="text-xs text-slate-500 mt-1">
                            {node.perParent} per {node.parentName} • Total to base: {node.localConversionRate.toLocaleString()}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500 mt-1">Foundation unit</p>
                        )}
                      </div>

                      <div className="text-right ml-4">
                        <div className="text-xs text-slate-400 font-medium">Level {node.level}</div>
                        <div className="font-bold text-xl text-slate-900 mt-1">
                          {node.localConversionRate.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {hierarchyTree.length === 0 && selectedBaseUnitId && (
            <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-lg border border-slate-100 border-dashed">
              No hierarchy configured for this base unit yet.
            </div>
          )}

          {/* Legend */}
          <div className="bg-slate-50 p-4 rounded-lg mt-8 text-xs text-slate-600 space-y-2 border border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300"></div>
              <span><strong className="text-slate-700">Blue:</strong> Base units (foundation)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-purple-100 border border-purple-300"></div>
              <span><strong className="text-slate-700">Purple:</strong> Intermediate units (mid-level)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#FFFDF4] border border-[#F5C742]"></div>
              <span><strong className="text-slate-700">Gold:</strong> Master units (bulk packaging)</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-lg flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-sm font-medium transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HierarchyBuilderModal;
