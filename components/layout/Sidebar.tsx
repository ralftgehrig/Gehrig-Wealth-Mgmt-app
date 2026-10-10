'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  BarChart3,
  Lightbulb,
  Settings,
  LogOut,
  Eye,
  EyeOff,
  Bitcoin,
  Receipt,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useDisplayCurrency, isBitcoinAccountName } from '@/lib/display-currency';
import type { Account, Currency } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const navItems = [
  { href: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/accounts',    icon: Wallet,           label: 'Accounts' },
  { href: '/income',      icon: TrendingUp,       label: 'Income' },
  { href: '/spending',    icon: Receipt,          label: 'Spending' },
  { href: '/projections', icon: BarChart3,        label: 'Projections' },
  { href: '/insights',    icon: Lightbulb,        label: 'Insights' },
  { href: '/settings',    icon: Settings,         label: 'Settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currency, setCurrency, displayCurrencies, privacyMode, togglePrivacy, hideBitcoin, toggleHideBitcoin } = useDisplayCurrency();
  const { data: accounts = [] } = useSWR<Account[]>('/api/accounts', fetcher);
  const hasBitcoinAccount = accounts.some((a) => isBitcoinAccountName(a.name));

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <aside
      className="hidden lg:flex flex-col w-60 min-h-screen fixed left-0 top-0 bottom-0 z-20"
      style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderRight: '0.5px solid rgba(60,60,67,0.12)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6" style={{ borderBottom: '0.5px solid rgba(60,60,67,0.12)' }}>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: '#007AFF' }}
        >
          <TrendingUp className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        <div>
          <p className="text-[15px] font-semibold" style={{ color: '#1C1C1E', letterSpacing: '-0.02em' }}>Family Wealth</p>
          <p className="text-[11px]" style={{ color: '#8E8E93' }}>Dashboard</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all',
                active ? 'text-[#007AFF]' : 'text-[#3C3C43] hover:text-[#1C1C1E]'
              )}
              style={active ? { background: 'rgba(0,122,255,0.1)' } : {}}
            >
              <Icon
                className={cn('w-[18px] h-[18px] flex-shrink-0')}
                strokeWidth={active ? 2.2 : 1.8}
                style={{ color: active ? '#007AFF' : '#8E8E93' }}
              />
              <span className="flex-1">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Currency switcher + privacy toggle */}
      <div className="px-4 py-3" style={{ borderTop: '0.5px solid rgba(60,60,67,0.12)' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Display currency</p>
          <div className="flex items-center gap-1.5">
            {hasBitcoinAccount && (
              <button
                onClick={toggleHideBitcoin}
                title={hideBitcoin ? 'Show Bitcoin account' : 'Hide Bitcoin account'}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                style={
                  hideBitcoin
                    ? { background: 'rgba(255,59,48,0.12)', color: '#FF3B30' }
                    : { background: 'rgba(118,118,128,0.12)', color: '#8E8E93' }
                }
              >
                <Bitcoin className="w-3.5 h-3.5" strokeWidth={hideBitcoin ? 2 : 1.8} />
              </button>
            )}
            <button
              onClick={togglePrivacy}
              title={privacyMode ? 'Show amounts' : 'Hide amounts for demo'}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
              style={
                privacyMode
                  ? { background: 'rgba(255,59,48,0.12)', color: '#FF3B30' }
                  : { background: 'rgba(118,118,128,0.12)', color: '#8E8E93' }
              }
            >
              {privacyMode
                ? <EyeOff className="w-3.5 h-3.5" strokeWidth={2} />
                : <Eye className="w-3.5 h-3.5" strokeWidth={1.8} />}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {displayCurrencies.map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c as Currency)}
              className="px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-colors"
              style={
                currency === c
                  ? { background: '#007AFF', color: '#fff' }
                  : { background: 'rgba(118,118,128,0.12)', color: '#636366' }
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <div className="px-3 py-4" style={{ borderTop: '0.5px solid rgba(60,60,67,0.12)' }}>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors w-full"
          style={{ color: '#FF3B30' }}
        >
          <LogOut className="w-[18px] h-[18px]" strokeWidth={1.8} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
