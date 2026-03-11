import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface Tab {
    key: string;
    label: string;
}

interface TabNavProps {
    tabs: Tab[];
    activeTab: string;
    onChange: (key: string) => void;
}

export const TabNav: React.FC<TabNavProps> = ({ tabs, activeTab, onChange }) => {
    return (
        <div className="flex gap-6 border-b border-border-subtle px-6 bg-bg-base">
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    onClick={() => onChange(tab.key)}
                    className={twMerge(
                        clsx(
                            'py-3 text-sm font-medium border-b-2 -mb-px transition-colors outline-none cursor-pointer',
                            activeTab === tab.key
                                ? 'border-brand text-brand'
                                : 'border-transparent text-muted-foreground hover:text-text-primary'
                        )
                    )}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
};
