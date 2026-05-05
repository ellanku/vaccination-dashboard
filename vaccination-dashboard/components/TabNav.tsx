/*
 * TabNav — navigation tabs for the dashboard sections.
 *
 * Four tabs: Overview, Demographics, Geography, Outreach.
 * Active tab shown in NHS blue (#005EB8), inactive in slate grey.
 * ARIA tabs role, keyboard navigation (arrow keys, Enter), tab selection.
 */

interface TabNavProps {
  activeTab: 'overview' | 'demographics' | 'geography' | 'outreach';
  onTabChange: (tab: 'overview' | 'demographics' | 'geography' | 'outreach') => void;
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'demographics', label: 'Demographics' },
    { id: 'geography', label: 'Geography' },
    { id: 'outreach', label: 'Outreach' },
  ] as const;

  const handleKeyDown = (e: React.KeyboardEvent, tabId: typeof tabs[number]['id']) => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    let newIndex = currentIndex;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      newIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      newIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTabChange(tabId);
      return;
    }

    if (newIndex !== currentIndex) {
      onTabChange(tabs[newIndex].id);
    }
  };

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <div role="tablist" className="flex gap-8">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`${tab.id}-panel`}
                onClick={() => onTabChange(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, tab.id)}
                className={`border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-b-[#005EB8] text-[#005EB8]'
                    : 'border-b-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
