'use client';

import { useState } from 'react';
import { MessageCircle, X, Send, Phone, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CHAT_PHONE = '+919777023934';
const CHAT_EMAIL = 'sales@safends.com';

export function ChatWidget() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleWhatsApp = () => {
    window.open(`https://wa.me/919777023934`, '_blank');
    setMenuOpen(false);
  };

  const handleCall = () => {
    window.open(`tel:${CHAT_PHONE}`, '_self');
    setMenuOpen(false);
  };

  const handleEmail = () => {
    window.open(`mailto:${CHAT_EMAIL}`, '_self');
    setMenuOpen(false);
  };

  const handleChat = () => {
    setMenuOpen(false);
    setChatOpen(true);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    // Send chat message via WhatsApp
    const whatsappUrl = `https://wa.me/919777023934?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    setSubmitted(true);
    setMessage('');
    setTimeout(() => {
      setSubmitted(false);
      setChatOpen(false);
    }, 2000);
  };

  const handleMainButtonClick = () => {
    if (chatOpen) {
      setChatOpen(false);
    } else {
      // Toggle the options menu on click so the widget works on touch
      // devices, which never fire the hover (onMouseEnter) handler.
      setMenuOpen((open) => !open);
    }
  };

  return (
    <>
      {/* Floating button wrapper — hover opens menu */}
      <div
        className="fixed bottom-6 right-6 z-60"
        onMouseEnter={() => { if (!chatOpen) setMenuOpen(true); }}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <motion.button
          type="button"
          onClick={handleMainButtonClick}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="h-14 w-14 rounded-full bg-[#D71920] text-white shadow-xl shadow-[#D71920]/30 flex items-center justify-center hover:bg-[#b8151b] transition-colors"
          aria-label="Contact us"
          aria-expanded={menuOpen || chatOpen}
        >
          {chatOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <MessageCircle className="h-6 w-6" />
          )}
        </motion.button>
      </div>

      {/* Options menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-24 right-6 z-60 flex flex-col gap-3 items-end"
            onMouseEnter={() => setMenuOpen(true)}
            onMouseLeave={() => setMenuOpen(false)}
          >
            {/* WhatsApp */}
            <motion.button
              type="button"
              onClick={handleWhatsApp}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 }}
              className="flex items-center gap-3 rounded-full bg-white border border-gray-200 shadow-lg pl-4 pr-3 py-2.5 hover:shadow-xl transition-shadow group"
            >
              <span className="text-sm font-medium text-gray-700 group-hover:text-[#25D366]">
                WhatsApp
              </span>
              <span className="h-10 w-10 rounded-full bg-[#25D366] flex items-center justify-center text-white">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </span>
            </motion.button>

            {/* Call */}
            <motion.button
              type="button"
              onClick={handleCall}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-3 rounded-full bg-white border border-gray-200 shadow-lg pl-4 pr-3 py-2.5 hover:shadow-xl transition-shadow group"
            >
              <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600">
                Call
              </span>
              <span className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center text-white">
                <Phone className="h-5 w-5" />
              </span>
            </motion.button>

            {/* Email */}
            <motion.button
              type="button"
              onClick={handleEmail}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="flex items-center gap-3 rounded-full bg-white border border-gray-200 shadow-lg pl-4 pr-3 py-2.5 hover:shadow-xl transition-shadow group"
            >
              <span className="text-sm font-medium text-gray-700 group-hover:text-orange-600">
                Email
              </span>
              <span className="h-10 w-10 rounded-full bg-orange-500 flex items-center justify-center text-white">
                <Mail className="h-5 w-5" />
              </span>
            </motion.button>

            {/* Chat */}
            <motion.button
              type="button"
              onClick={handleChat}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-3 rounded-full bg-white border border-gray-200 shadow-lg pl-4 pr-3 py-2.5 hover:shadow-xl transition-shadow group"
            >
              <span className="text-sm font-medium text-gray-700 group-hover:text-[#D71920]">
                Chat
              </span>
              <span className="h-10 w-10 rounded-full bg-[#D71920] flex items-center justify-center text-white">
                <MessageCircle className="h-5 w-5" />
              </span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat popup */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-24 right-6 z-60 w-[min(20rem,calc(100vw-3rem))] rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-[#D71920] px-5 py-4">
              <p className="text-white font-semibold">Chat with Safend</p>
              <p className="text-white/70 text-xs mt-0.5">
                We typically reply within minutes
              </p>
            </div>

            {/* Body */}
            <div className="p-5">
              {submitted ? (
                <div className="text-center py-4">
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <MessageCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    Message sent!
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    We&apos;ll get back to you shortly
                  </p>
                </div>
              ) : (
                <>
                  {/* Quick message bubble */}
                  <div className="bg-gray-50 rounded-xl rounded-bl-sm px-4 py-3 mb-4">
                    <p className="text-sm text-gray-600">
                      Hi! 👋 How can we help you today? Ask us anything about
                      our security services.
                    </p>
                  </div>

                  <form onSubmit={handleChatSubmit} className="space-y-3">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your message..."
                      rows={3}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm resize-none focus:outline-hidden focus:ring-2 focus:ring-[#D71920]/20 focus:border-[#D71920]/50"
                    />
                    <button
                      type="submit"
                      disabled={!message.trim()}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#D71920] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#b8151b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send via WhatsApp
                    </button>
                  </form>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
