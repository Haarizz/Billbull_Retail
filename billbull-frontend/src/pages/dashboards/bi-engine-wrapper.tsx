import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Button } from "../../components/ui/button";
import { Brain, Sparkles, ArrowLeft } from 'lucide-react';
import { BillBullBIEngineDashboard } from "./bi-engine-dashboard-v2";
import { ExtraStrategicIntelligence } from "./extra-strategic-intelligence";

interface BIEngineWrapperProps {
  formatCurrency?: (amount: number) => string;
  getCurrentPeriod?: () => string;
  onBack?: () => void;
}

export function BIEngineWrapper({ formatCurrency, getCurrentPeriod, onBack }: BIEngineWrapperProps) {
  const [activeTab, setActiveTab] = useState('main-dashboard');

  // Default utility functions
  const defaultFormatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const defaultGetCurrentPeriod = () => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const currencyFormatter = formatCurrency || defaultFormatCurrency;
  const periodGetter = getCurrentPeriod || defaultGetCurrentPeriod;

  return (
    <div className="space-y-6">
      {onBack && (
        <Button
          variant="outline"
          onClick={onBack}
          className="border-[#F5C742] text-[#F5C742] hover:bg-[#F5C742] hover:text-black"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Overview
        </Button>
      )}
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 bg-white shadow-md">
          <TabsTrigger 
            value="main-dashboard" 
            className="data-[state=active]:bg-[#F5C742] data-[state=active]:text-black"
          >
            <Brain className="h-4 w-4 mr-2" />
            BillBull Strategic BI & Decision-Making Engineâ„¢
          </TabsTrigger>
          <TabsTrigger 
            value="extra-intelligence" 
            className="data-[state=active]:bg-[#F5C742] data-[state=active]:text-black"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Extra Strategic Intelligence
          </TabsTrigger>
        </TabsList>

        <TabsContent value="main-dashboard">
          <BillBullBIEngineDashboard 
            formatCurrency={currencyFormatter}
            getCurrentPeriod={periodGetter}
          />
        </TabsContent>

        <TabsContent value="extra-intelligence">
          <ExtraStrategicIntelligence 
            formatCurrency={currencyFormatter}
            getCurrentPeriod={periodGetter}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
