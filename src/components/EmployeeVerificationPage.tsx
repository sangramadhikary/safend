'use client';
import { useState, useEffect, useRef } from "react";
import { TurnstileWidget, type TurnstileHandle } from "@/components/TurnstileWidget";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ShieldCheck, X, User, Building2, Calendar,
  Briefcase, CheckCircle, AlertCircle, Loader2, ArrowRight, BadgeCheck,
  ShieldAlert, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HREmployee } from "@/services/supabase/HREmployeeService";

// Rate limit: 3 searches per 60 seconds stored in sessionStorage
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60_000;

function getRateState(): { timestamps: number[] } {
  try { return JSON.parse(sessionStorage.getItem('verify:rate') || '{"timestamps":[]}'); } catch { return { timestamps: [] }; }
}
function recordSearch(): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const state = getRateState();
  const recent = state.timestamps.filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    const resetIn = Math.ceil((RATE_WINDOW_MS - (now - recent[0])) / 1000);
    return { allowed: false, remaining: 0, resetIn };
  }
  recent.push(now);
  sessionStorage.setItem('verify:rate', JSON.stringify({ timestamps: recent }));
  return { allowed: true, remaining: RATE_LIMIT - recent.length, resetIn: 0 };
}

interface EmployeeVerificationPageProps {
  isOpen: boolean;
  onClose: () => void;
  onEmployeeOnboard: () => void;
  onClientOnboard: () => void;
}

export default function EmployeeVerificationPage({ isOpen, onClose }: EmployeeVerificationPageProps) {
  const [searchTerm, setSearchTerm]     = useState('');
  const [isSearching, setIsSearching]   = useState(false);
  const [searchResults, setSearchResults] = useState<HREmployee[]>([]);
  const [hasSearched, setHasSearched]   = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<HREmployee | null>(null);
  const [showProfile, setShowProfile]   = useState(false);

  // Cloudflare Turnstile verification — token is single-use per search.
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileHandle>(null);
  const humanVerified = !!turnstileToken;

  // Rate limiting
  const [rateLimited, setRateLimited]   = useState(false);
  const [rateCooldown, setRateCooldown] = useState(0);
  const [searchesLeft, setSearchesLeft] = useState(RATE_LIMIT);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = (seconds: number) => {
    setRateLimited(true);
    setRateCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setRateCooldown(s => {
        if (s <= 1) {
          clearInterval(cooldownRef.current!);
          setRateLimited(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm(''); setSearchResults([]); setHasSearched(false);
      setTurnstileToken(''); turnstileRef.current?.reset();
    }
  }, [isOpen]);

  // Calls the server-side API route (service role, bypasses RLS + auth)
  const searchEmployees = async (term: string, token: string): Promise<HREmployee[]> => {
    const t = term.trim();
    if (!t) return [];
    try {
      const res = await fetch(`/api/verify-employee?q=${encodeURIComponent(t)}`, {
        headers: { 'cf-turnstile-token': token },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { employees } = await res.json();
      return (employees || []).map((row: any): HREmployee => ({
        id: row.id,
        employeeId: row.employee_id || '',
        name: row.name || '',
        email: row.email || '',
        phone: row.phone || '',
        gender: row.gender || 'male',
        department: row.department || '',
        designation: row.designation || '',
        joinDate: row.join_date || '',
        employmentType: 'Full-Time',
        status: row.status === 'active' ? 'Active' : row.status === 'inactive' ? 'Inactive' : row.status || 'Active',
        address: row.address,
        avatar: row.photo_url || undefined,
        photoUrl: row.photo_url || undefined,
        salary: row.salary || row.monthly_salary,
        bloodGroup: row.blood_group,
        branchId: row.branch_id,
      }));
    } catch (err: any) {
      console.error('[Verify] search error:', err.message);
      return [];
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchTerm.trim() || !turnstileToken) return;

    const rate = recordSearch();
    setSearchesLeft(rate.remaining);
    if (!rate.allowed) { startCooldown(rate.resetIn); return; }

    setIsSearching(true);
    const results = await searchEmployees(searchTerm, turnstileToken);
    setSearchResults(results);
    setHasSearched(true);
    setIsSearching(false);

    // Turnstile tokens are single-use — clear and reset to get a fresh one for
    // the next search (Managed mode re-solves invisibly for most visitors).
    setTurnstileToken('');
    turnstileRef.current?.reset();
  };

  const handleInputChange = (value: string) => {
    setSearchTerm(value);
    // Clear results when input changes — don't auto-search (respect rate limit)
    if (!value) { setSearchResults([]); setHasSearched(false); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':   return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800';
      case 'Inactive': return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800';
      case 'On Leave': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800';
      default:         return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700';
    }
  };
  const getStatusDot = (status: string) =>
    status === 'Active' ? 'bg-emerald-500' : status === 'On Leave' ? 'bg-amber-500' : 'bg-gray-400';

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 z-200 overflow-y-auto bg-white dark:bg-[#0B0F19]">
      {/* Close */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="fixed top-5 right-5 z-210 h-10 w-10 rounded-full border border-gray-200 bg-white hover:bg-gray-50 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10"
      >
        <X className="h-5 w-5" />
      </Button>

      <div className="relative z-201 min-h-screen flex flex-col">
        {/* Header with logo */}
        <header className="w-full border-b border-gray-100 dark:border-white/5 bg-white dark:bg-[#0B0F19]">
          <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
            <img src="/logo.png" alt="Safend" className="h-8" />
            <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">Employee Verification</span>
          </div>
        </header>

        {/* Main content — vertically centered */}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-2xl -mt-10">
            {/* Heading */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="text-center mb-8"
            >
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground leading-[1.1]">
                Verify an Employee
              </h1>
              <p className="text-sm md:text-base text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
                Confirm the identity and employment status of Safend personnel by name or employee ID.
              </p>
            </motion.div>

            {/* Search bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <form onSubmit={handleSearch}>
                <div className={cn(
                  "group relative flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-[#11161f] border transition-all",
                  humanVerified
                    ? "border-gray-200 dark:border-white/10 shadow-lg shadow-black/5 focus-within:border-[#D71920]/50 focus-within:ring-4 focus-within:ring-[#D71920]/10"
                    : "border-gray-100 dark:border-white/5 opacity-60 pointer-events-none shadow-xs"
                )}>
                  <Search className="ml-3 h-5 w-5 text-muted-foreground shrink-0" />
                  <Input
                    type="text"
                    placeholder="Search by name, ID, or designation..."
                    value={searchTerm}
                    onChange={(e) => handleInputChange(e.target.value)}
                    disabled={!humanVerified || rateLimited}
                    className="flex-1 h-12 border-0 bg-transparent text-base shadow-none focus-visible:ring-0 px-1"
                  />
                  <Button
                    type="submit"
                    disabled={isSearching || !humanVerified || rateLimited || !searchTerm.trim()}
                    className="h-11 px-6 bg-[#D71920] hover:bg-[#b8151b] text-white rounded-lg font-medium shrink-0 disabled:opacity-50"
                  >
                    {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Search<ArrowRight className="h-4 w-4 ml-1.5" /></>}
                  </Button>
                </div>
              </form>

              {/* Turnstile + rate limit info */}
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <TurnstileWidget
                  ref={turnstileRef}
                  onVerify={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken('')}
                />
                <div className="text-center sm:text-right">
                  {rateLimited ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-amber-600 text-sm">
                      <Clock className="h-4 w-4" />
                      <span>Try again in <strong>{rateCooldown}s</strong></span>
                    </motion.div>
                  ) : humanVerified ? (
                    <p className="text-xs text-muted-foreground">
                      {searchesLeft > 0
                        ? `${searchesLeft} search${searchesLeft !== 1 ? 'es' : ''} remaining`
                        : 'Rate limit reached'}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Complete verification to search</p>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Results */}
            <div className="mt-8 pb-16">
              <AnimatePresence mode="wait">
                {searchResults.length > 0 && (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-3"
                >
                  <p className="text-xs font-medium text-muted-foreground px-1 uppercase tracking-wider">
                    {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'} found
                  </p>
                  {searchResults.map((employee, index) => (
                    <motion.button
                      key={employee.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => { setSelectedEmployee(employee); setShowProfile(true); }}
                      className="w-full text-left group relative flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-[#11161f] border border-gray-200 dark:border-white/10 hover:border-[#D71920]/40 hover:shadow-lg hover:shadow-[#D71920]/5 transition-all duration-200"
                    >
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <Avatar className="h-14 w-14 ring-2 ring-white dark:ring-white/10 shadow-sm">
                          <AvatarImage src={employee.avatar} />
                          <AvatarFallback className="bg-[#D71920] text-white text-lg font-bold">
                            {employee.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className={cn("absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white dark:border-[#11161f]", getStatusDot(employee.status))} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold text-foreground group-hover:text-[#D71920] transition-colors truncate">
                            {employee.name}
                          </h3>
                          <Badge variant="outline" className={cn("text-[10px] px-2 py-0", getStatusColor(employee.status))}>
                            {employee.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-[#D71920] font-medium mt-0.5 truncate">{employee.designation}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{employee.department}</span>
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{employee.employeeId}</span>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center bg-gray-50 dark:bg-white/5 text-muted-foreground group-hover:bg-[#D71920] group-hover:text-white transition-all">
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </motion.button>
                  ))}
                </motion.div>
              )}

              {/* No results */}
              {hasSearched && searchResults.length === 0 && !isSearching && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-16"
                >
                  <div className="h-16 w-16 rounded-2xl bg-gray-50 dark:bg-white/5 border flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="h-7 w-7 text-muted-foreground/60" />
                  </div>
                  <h4 className="text-lg font-semibold mb-1">No employee found</h4>
                  <p className="text-sm text-muted-foreground">No records match &ldquo;{searchTerm}&rdquo;. Try a different name or ID.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center py-5 text-xs text-muted-foreground border-t border-gray-100 dark:border-white/5">
          <p>&copy; {new Date().getFullYear()} Safend Secure Solutions Pvt. Ltd.</p>
        </footer>
      </div>
    </div>

    {/* Profile Modal — z-index above the fixed overlay */}
    <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden" style={{ zIndex: 99999 }}>
          <VisuallyHidden><DialogTitle>Employee Profile</DialogTitle></VisuallyHidden>
          {selectedEmployee && (
            <>
              {/* Header banner */}
              <div className="relative bg-linear-to-br from-[#D71920] to-[#8f1014] px-6 pt-6 pb-8 text-white">
                <div className="absolute top-3 right-3">
                  <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-xs text-[11px]">
                    <BadgeCheck className="h-3 w-3 mr-1" /> Verified
                  </Badge>
                </div>
                <div className="flex items-center gap-5">
                  <Avatar className="h-20 w-20 ring-4 ring-white/30 shadow-xl">
                    <AvatarImage src={selectedEmployee.avatar} />
                    <AvatarFallback className="bg-white text-[#D71920] text-2xl font-bold">
                      {selectedEmployee.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="text-2xl font-bold truncate">{selectedEmployee.name}</h3>
                    <p className="text-white/90 font-medium">{selectedEmployee.designation}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="bg-white/15 text-white border-white/30 text-[11px]">
                        <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5", getStatusDot(selectedEmployee.status))} />
                        {selectedEmployee.status}
                      </Badge>
                      <span className="text-xs text-white/80 flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {selectedEmployee.department}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Details grid */}
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DetailItem icon={User} label="Employee ID" value={selectedEmployee.employeeId} mono accent />
                  <DetailItem icon={Calendar} label="Join Date" value={selectedEmployee.joinDate ? new Date(selectedEmployee.joinDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'} />
                  <DetailItem icon={Building2} label="Department" value={selectedEmployee.department || '—'} />
                  <DetailItem icon={Briefcase} label="Designation" value={selectedEmployee.designation || '—'} />
                </div>

                {/* Verification footer */}
                <div className="mt-5 flex items-center gap-3 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <div className="h-9 w-9 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                    <CheckCircle className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400 text-sm">Identity Verified</p>
                    <p className="text-xs text-emerald-600/80 dark:text-emerald-500/80">This person is an authorised Safend employee.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailItem({ icon: Icon, label, value, mono, accent }: { icon: any; label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/3 border border-gray-100 dark:border-white/5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={cn("font-medium truncate", mono && "font-mono", accent && "text-[#D71920] font-bold")}>{value}</p>
    </div>
  );
}
