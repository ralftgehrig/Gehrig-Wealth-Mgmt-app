'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Wallet, TrendingUp, BarChart3, Lightbulb, Eye, EyeOff, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDisplayCurrency } from '@/lib/display-currency';

const navItems = [
  { href: '/dashboard',   icon: LayoutDashboard, label: 'Home' },
  { href: '/accounts',    icon: Wallet,           label: 'Accounts' },
  { href: '/spending',    icon: Receipt,          label: 'Spending' },
  { href: '/income',      icon: TrendingUp,       label: 'Income' },
  { href: '/projections', icon: BarChart3,        label: 'Forecast' },
  { href: '/insights',    icon: Lightbulb,        label: 'Insights' },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { privacyMode, togglePrivacy } = useDisplayCurrency();

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 px-4"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
    >
      {/* Floating pill */}
      <div
        className="flex items-center justify-around px-2 py-1.5 overflow-x-auto"
        style={{
          scrollbarWidth: 'none',
          background: 'rgba(255, 255, 255, 0.82)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderRadius: 28,
          boxShadow: '0 8px 40px rgba(0,0,0,0.14), 0 1px 0 rgba(255,255,255,0.6) inset, 0 -0.5px 0 rgba(0,0,0,0.08)',
          border: '0.5px solid rgba(255,255,255,0.5)',
        }}
      >
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-2xl transition-all duration-150 flex-shrink-0',
                active ? 'opacity-100' : 'opacity-50 active:opacity-75'
              )}
            >
              <div
                className={cn(
                  'w-7 h-7 flex items-center justify-center rounded-xl transition-all duration-150',
                  active && 'bg-[#007AFF]/10'
                )}
              >
                <Icon
                  className="w-[22px] h-[22px]"
                  style={{ color: active ? '#007AFF' : '#3C3C43' }}
                  strokeWidth={active ? 2.2 : 1.8}
                />
              </div>
              <span
                className="text-[10px] font-semibold tracking-tight"
                style={{
                  color: active ? '#007AFF' : '#3C3C43',
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {/* Privacy toggle */}
        <button
          onClick={togglePrivacy}
          aria-label={privacyMode ? 'Show amounts' : 'Hide amounts'}
          className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-2xl transition-all duration-150 active:opacity-75 flex-shrink-0"
          style={{ opacity: privacyMode ? 1 : 0.5 }}
        >
          <div
            className="w-7 h-7 flex items-center justify-center rounded-xl transition-all duration-150"
            style={privacyMode ? { background: 'rgba(255,59,48,0.12)' } : {}}
          >
            {privacyMode
              ? <EyeOff className="w-[22px] h-[22px]" style={{ color: '#FF3B30' }} strokeWidth={2.2} />
              : <Eye className="w-[22px] h-[22px]" style={{ color: '#3C3C43' }} strokeWidth={1.8} />}
          </div>
          <span
            className="text-[10px] font-semibold tracking-tight"
            style={{
              color: privacyMode ? '#FF3B30' : '#3C3C43',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            {privacyMode ? 'Show' : 'Hide'}
          </span>
        </button>
      </div>
    </nav>
  );
}
