import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X, Warehouse, Layers, MapPin, Box, ChevronRight } from 'lucide-react';
import { getWarehouseTree } from '../../api/warehouseApi';

// Reusable styling for dropdown
const dropdownStyle = "w-full border rounded-md py-2 px-3 bg-white flex items-center justify-between cursor-pointer hover:border-slate-300 border-slate-200";

const LocationSelector = ({
  value, // { warehouseId, zoneId, locatorId, binId, warehouseName, zoneName, locatorName, binCode }
  onChange,
  disabled = false,
  className = "",
  placeholder = "Select Location...",
  menuPlacement = "auto",
  menuZIndexClass = "z-50"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [openUpward, setOpenUpward] = useState(false);
  const [loading, setLoading] = useState(false);
  const [treeData, setTreeData] = useState({ warehouses: [], zones: [], locators: [], bins: [] });
  const [expandedNodes, setExpandedNodes] = useState({});

  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const tree = await getWarehouseTree();
      setTreeData({
        warehouses: Array.isArray(tree.warehouses) ? tree.warehouses : [],
        zones: Array.isArray(tree.zones) ? tree.zones : [],
        locators: Array.isArray(tree.locators) ? tree.locators : [],
        bins: Array.isArray(tree.bins) ? tree.bins : []
      });
      // Pre-expand based on current value if present
      if (value?.warehouseId) toggleExpand(`w-${value.warehouseId}`, true);
      if (value?.zoneId) toggleExpand(`z-${value.zoneId}`, true);
      if (value?.locatorId) toggleExpand(`l-${value.locatorId}`, true);
    } catch (e) {
      console.error('Failed to load locations', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (menuPlacement === "top") {
      setOpenUpward(true);
      return;
    }

    if (menuPlacement !== "auto" || !dropdownRef.current) {
      setOpenUpward(false);
      return;
    }

    const updateDirection = () => {
      if (!dropdownRef.current) return;
      const rect = dropdownRef.current.getBoundingClientRect();
      const estimatedMenuHeight = 320;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setOpenUpward(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow);
    };

    updateDirection();
    window.addEventListener('resize', updateDirection);
    return () => window.removeEventListener('resize', updateDirection);
  }, [isOpen, menuPlacement]);

  const toggleExpand = (nodeId, forceState = null) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: forceState !== null ? forceState : !prev[nodeId]
    }));
  };

  const handleSelect = (level, item, parents) => {
    const payload = {
      warehouseId: null, warehouseName: '',
      zoneId: null, zoneName: '',
      locatorId: null, locatorName: '',
      binId: null, binCode: ''
    };

    if (level === 'warehouse') {
      payload.warehouseId = item.id;
      payload.warehouseName = item.name;
    } else if (level === 'zone') {
      payload.warehouseId = parents.warehouse.id; payload.warehouseName = parents.warehouse.name;
      payload.zoneId = item.id; payload.zoneName = item.name;
    } else if (level === 'locator') {
      payload.warehouseId = parents.warehouse.id; payload.warehouseName = parents.warehouse.name;
      payload.zoneId = parents.zone.id; payload.zoneName = parents.zone.name;
      payload.locatorId = item.id; payload.locatorName = item.name;
    } else if (level === 'bin') {
      payload.warehouseId = parents.warehouse.id; payload.warehouseName = parents.warehouse.name;
      payload.zoneId = parents.zone.id; payload.zoneName = parents.zone.name;
      payload.locatorId = parents.locator.id; payload.locatorName = parents.locator.name;
      payload.binId = item.id; payload.binCode = item.code;
    }

    onChange(payload);
    setIsOpen(false);
    setSearchTerm('');
  };

  const clearSelection = (e) => {
    e.stopPropagation();
    onChange({
      warehouseId: null, warehouseName: '',
      zoneId: null, zoneName: '',
      locatorId: null, locatorName: '',
      binId: null, binCode: ''
    });
    setIsOpen(false);
  };

  const buildHierarchy = useMemo(() => {
    const term = searchTerm.toLowerCase();
    
    // Grouping
    const zonesByWh = {};
    treeData.zones.forEach(z => { zonesByWh[z.warehouseId] = zonesByWh[z.warehouseId] || []; zonesByWh[z.warehouseId].push(z); });
    
    const locsByZone = {};
    treeData.locators.forEach(l => { locsByZone[l.zoneId] = locsByZone[l.zoneId] || []; locsByZone[l.zoneId].push(l); });
    
    const binsByLoc = {};
    treeData.bins.forEach(b => { binsByLoc[b.locatorId] = binsByLoc[b.locatorId] || []; binsByLoc[b.locatorId].push(b); });

    const isMatch = (str) => str && str.toLowerCase().includes(term);

    // Filter tree
    const result = [];
    treeData.warehouses.forEach(wh => {
      const whMatch = isMatch(wh.name);
      let whHasMatch = whMatch;
      
      const whZones = [];
      (zonesByWh[wh.id] || []).forEach(zone => {
        const zoneMatch = isMatch(zone.name) || isMatch(zone.code);
        let zoneHasMatch = zoneMatch;
        
        const zoneLocs = [];
        (locsByZone[zone.id] || []).forEach(loc => {
          const locMatch = isMatch(loc.name) || isMatch(loc.code);
          let locHasMatch = locMatch;
          
          const locBins = [];
          (binsByLoc[loc.id] || []).forEach(bin => {
            const binMatch = isMatch(bin.name) || isMatch(bin.code);
            if (binMatch || locMatch || zoneMatch || whMatch || !term) {
              locBins.push({ ...bin, isMatch: binMatch });
              locHasMatch = true;
            }
          });
          
          if (locHasMatch || zoneMatch || whMatch || !term) {
            zoneLocs.push({ ...loc, bins: locBins, isMatch: locMatch });
            zoneHasMatch = true;
          }
        });
        
        if (zoneHasMatch || whMatch || !term) {
          whZones.push({ ...zone, locators: zoneLocs, isMatch: zoneMatch });
          whHasMatch = true;
        }
      });
      
      if (whHasMatch || !term) {
        result.push({ ...wh, zones: whZones, isMatch: whMatch });
      }
    });

    return result;
  }, [treeData, searchTerm]);

  // If there's a search term, force expand all matching nodes
  useEffect(() => {
    if (searchTerm) {
      const newExpanded = {};
      buildHierarchy.forEach(wh => {
        newExpanded[`w-${wh.id}`] = true;
        wh.zones.forEach(z => {
          newExpanded[`z-${z.id}`] = true;
          z.locators.forEach(l => {
            newExpanded[`l-${l.id}`] = true;
          });
        });
      });
      setExpandedNodes(newExpanded);
    }
  }, [searchTerm, buildHierarchy]);

  const hasValue = !!value?.warehouseId;
  const displayLabel = useMemo(() => {
    if (!hasValue) return placeholder;
    const parts = [];
    if (value.warehouseName) parts.push(value.warehouseName);
    if (value.zoneName) parts.push(value.zoneName);
    if (value.locatorName) parts.push(value.locatorName);
    if (value.binCode) parts.push(value.binCode);
    return parts.join(' > ');
  }, [value, hasValue, placeholder]);

  return (
    <div className={`relative overflow-visible ${className}`} ref={dropdownRef}>
      <div
        className={`${dropdownStyle} ${disabled ? 'bg-slate-50 cursor-not-allowed text-slate-500 hover:border-slate-200' : ''} ${isOpen ? 'ring-1 ring-[#F5C742] border-[#F5C742]' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className={`text-sm truncate flex-1 pr-2 ${hasValue ? 'text-slate-900' : 'text-slate-400'}`}>
          {displayLabel}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasValue && !disabled && (
            <div
              onClick={clearSelection}
              className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={14} />
            </div>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && !disabled && (
        <div className={`absolute left-0 ${menuZIndexClass} w-full min-w-[320px] bg-white border border-slate-200 rounded-md shadow-lg max-h-80 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100 ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          <div className="p-2 border-b border-slate-100 sticky top-0 bg-white z-10">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#F5C742]"
                placeholder="Search warehouse, zone, locator, or bin..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          
          <div className="overflow-y-auto flex-1 p-1">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-500">Loading locations...</div>
            ) : buildHierarchy.length > 0 ? (
              buildHierarchy.map(wh => (
                <div key={`w-${wh.id}`} className="text-sm">
                  <div 
                    className="flex items-center group rounded hover:bg-slate-50 transition-colors"
                  >
                    <button 
                      className="p-1.5 shrink-0 text-slate-400 hover:text-slate-600"
                      onClick={(e) => { e.stopPropagation(); toggleExpand(`w-${wh.id}`); }}
                    >
                      <ChevronRight size={14} className={`transition-transform ${expandedNodes[`w-${wh.id}`] ? 'rotate-90' : ''}`} />
                    </button>
                    <div 
                      className={`flex-1 flex items-center gap-2 py-1.5 pr-2 cursor-pointer ${value?.warehouseId === wh.id && !value.zoneId ? 'text-[#F5C742] font-semibold' : 'text-slate-700'}`}
                      onClick={() => handleSelect('warehouse', wh, {})}
                    >
                      <Warehouse size={14} className={value?.warehouseId === wh.id && !value.zoneId ? 'text-[#F5C742]' : 'text-amber-500'} />
                      <span className="truncate">{wh.name}</span>
                    </div>
                  </div>

                  {expandedNodes[`w-${wh.id}`] && (
                    <div className="pl-4 border-l border-slate-100 ml-2.5">
                      {wh.zones.map(zone => (
                        <div key={`z-${zone.id}`}>
                          <div className="flex items-center group rounded hover:bg-slate-50 transition-colors">
                            <button 
                              className="p-1 shrink-0 text-slate-400 hover:text-slate-600 ml-0.5"
                              onClick={(e) => { e.stopPropagation(); toggleExpand(`z-${zone.id}`); }}
                            >
                              <ChevronRight size={14} className={`transition-transform ${expandedNodes[`z-${zone.id}`] ? 'rotate-90' : ''}`} />
                            </button>
                            <div 
                              className={`flex-1 flex items-center gap-2 py-1 pr-2 cursor-pointer ${value?.zoneId === zone.id && !value.locatorId ? 'text-[#F5C742] font-semibold' : 'text-slate-600'}`}
                              onClick={() => handleSelect('zone', zone, { warehouse: wh })}
                            >
                              <Layers size={13} className={value?.zoneId === zone.id && !value.locatorId ? 'text-[#F5C742]' : 'text-emerald-500'} />
                              <span className="truncate">{zone.name} <span className="text-[10px] text-slate-400 ml-1">({zone.code})</span></span>
                            </div>
                          </div>

                          {expandedNodes[`z-${zone.id}`] && (
                            <div className="pl-4 border-l border-slate-100 ml-2">
                              {zone.locators.map(loc => (
                                <div key={`l-${loc.id}`}>
                                  <div className="flex items-center group rounded hover:bg-slate-50 transition-colors">
                                    <button 
                                      className="p-1 shrink-0 text-slate-400 hover:text-slate-600 ml-0.5"
                                      onClick={(e) => { e.stopPropagation(); toggleExpand(`l-${loc.id}`); }}
                                    >
                                      <ChevronRight size={14} className={`transition-transform ${expandedNodes[`l-${loc.id}`] ? 'rotate-90' : ''}`} />
                                    </button>
                                    <div 
                                      className={`flex-1 flex items-center gap-2 py-1 pr-2 cursor-pointer ${value?.locatorId === loc.id && !value.binId ? 'text-[#F5C742] font-semibold' : 'text-slate-600'}`}
                                      onClick={() => handleSelect('locator', loc, { warehouse: wh, zone })}
                                    >
                                      <MapPin size={13} className={value?.locatorId === loc.id && !value.binId ? 'text-[#F5C742]' : 'text-blue-500'} />
                                      <span className="truncate">{loc.code} <span className="text-[10px] text-slate-400 ml-1">{loc.name}</span></span>
                                    </div>
                                  </div>

                                  {expandedNodes[`l-${loc.id}`] && (
                                    <div className="pl-5 border-l border-slate-100 ml-2 py-0.5">
                                      {loc.bins.map(bin => (
                                        <div 
                                          key={`b-${bin.id}`}
                                          className={`flex items-center gap-2 py-1 px-1 cursor-pointer rounded hover:bg-slate-50 transition-colors ${value?.binId === bin.id ? 'bg-amber-50 text-[#F5C742] font-semibold' : 'text-slate-600'}`}
                                          onClick={() => handleSelect('bin', bin, { warehouse: wh, zone, locator: loc })}
                                        >
                                          <Box size={13} className={value?.binId === bin.id ? 'text-[#F5C742]' : 'text-orange-500'} />
                                          <span className="truncate">{bin.code}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-slate-500">No locations match your search</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationSelector;
