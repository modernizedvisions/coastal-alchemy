import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { adminDeleteMessage } from '../../lib/adminApi';
import { adminFetch } from '../../lib/adminAuth';
import { AdminSectionHeader } from './AdminSectionHeader';
import { formatEasternDateTime } from '../../lib/dates';

interface AdminMessage {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  imageUrl?: string | null;
  createdAt: string;
  status?: string;
  type?: 'message' | 'custom_order' | string;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryIds?: string[];
  categoryNames?: string[];
  isRead?: boolean;
  readAt?: string | null;
  inspoExampleId?: string | null;
  inspoTitle?: string | null;
  inspoImageUrl?: string | null;
}

export interface AdminMessagesTabProps {
  onCreateCustomOrderFromMessage?: (message: {
    id: string;
    name: string;
    email: string;
    message: string;
  }) => void;
  onUnreadCountChange?: (count: number) => void;
}

export const AdminMessagesTab: React.FC<AdminMessagesTabProps> = ({ onCreateCustomOrderFromMessage, onUnreadCountChange }) => {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<AdminMessage | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const getTypeLabel = (type?: string | null) =>
    type === 'custom_order' ? 'Custom Order' : 'Message';

  const formatPhoneForDisplay = (phone?: string | null) => {
    const raw = (phone || '').trim();
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return raw;
  };

  const copyEmailToClipboard = (email: string) => {
    void navigator.clipboard?.writeText(email);
    toast.success('Email copied to clipboard!');
  };

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await adminFetch('/api/admin/messages');
        if (!res.ok) throw new Error('Failed to load messages');
        const json = await res.json();
        let incoming: AdminMessage[];
        if (Array.isArray(json)) {
          incoming = json as AdminMessage[];
        } else if (Array.isArray(json?.messages)) {
          incoming = json.messages as AdminMessage[];
        } else {
          console.error('[AdminMessagesTab] Unexpected messages payload', json);
          incoming = [];
        }
        console.log('[AdminMessagesTab] Loaded messages', incoming);
        setMessages(incoming);
        const unreadCount =
          typeof json?.unreadCount === 'number'
            ? json.unreadCount
            : incoming.reduce((count, msg) => count + (msg.isRead ? 0 : 1), 0);
        onUnreadCountChange?.(unreadCount);
      } catch (err) {
        console.error('[AdminMessagesTab] Failed to load messages', err);
        setError('Failed to load messages');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      }),
    [messages]
  );

  const openMessage = (msg: AdminMessage) => {
    setSelectedMessage(msg);
    setIsDialogOpen(true);
    if (!msg.isRead) {
      setMessages((prev) => {
        const next = prev.map((item) => (item.id === msg.id ? { ...item, isRead: true } : item));
        const unreadCount = next.reduce((count, item) => count + (item.isRead ? 0 : 1), 0);
        onUnreadCountChange?.(unreadCount);
        return next;
      });
      void markMessageRead(msg.id);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  const handleDeleteMessage = () => {
    if (!selectedMessage) return;
    setIsDeleteConfirmOpen(true);
  };

  const handleCreateCustomOrder = () => {
    if (!selectedMessage || !onCreateCustomOrderFromMessage) return;
    onCreateCustomOrderFromMessage({
      id: selectedMessage.id,
      name: selectedMessage.name || '',
      email: selectedMessage.email || '',
      message: selectedMessage.message || '',
    });
    setIsDialogOpen(false);
    setSelectedMessage(null);
  };

  const markMessageRead = async (id: string) => {
    try {
      const res = await adminFetch('/api/admin/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to mark message as read');
      }
      const data = await res.json().catch(() => null);
      if (typeof data?.unreadCount === 'number') {
        onUnreadCountChange?.(data.unreadCount);
      }
    } catch (err) {
      console.error('[AdminMessagesTab] Failed to mark message as read', err);
      setMessages((prev) => {
        const next = prev.map((item) => (item.id === id ? { ...item, isRead: false } : item));
        const unreadCount = next.reduce((count, item) => count + (item.isRead ? 0 : 1), 0);
        onUnreadCountChange?.(unreadCount);
        return next;
      });
      toast.error("Couldn't mark message as read");
    }
  };

  const confirmDeleteMessage = async () => {
    if (!selectedMessage) return;
    const id = selectedMessage.id;
    console.debug('[messages] delete clicked', { id, hasHandler: !!adminDeleteMessage });
    console.debug('[messages] calling delete endpoint', { url: `/api/admin/messages/${id}`, method: 'DELETE' });
    setIsDeleting(true);
    try {
      await adminDeleteMessage(id);
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== id);
        const unreadCount = next.reduce((count, msg) => count + (msg.isRead ? 0 : 1), 0);
        onUnreadCountChange?.(unreadCount);
        return next;
      });
      setSelectedMessage(null);
      setIsDialogOpen(false);
      setIsDeleteConfirmOpen(false);
      toast.success('Message deleted from dashboard');
    } catch (err) {
      console.error('[AdminMessagesTab] Failed to delete message', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete message');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="lux-card p-6">
      <AdminSectionHeader title="Messages" subtitle="Customer messages from the contact form." />

      {isLoading && <div className="text-sm text-charcoal/70">Loading messages...</div>}
      {error && !isLoading && <div className="text-sm text-rose-700">{error}</div>}

      {sortedMessages.length === 0 ? (
        <div className="text-sm text-charcoal/60">No messages yet.</div>
      ) : (
        <>
          <div className="sm:hidden">
            <table className="min-w-full divide-y divide-driftwood/50">
              <thead className="bg-linen/70">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Name</th>
                  <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Type</th>
                  <th className="px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-driftwood/40 bg-white/80">
                {sortedMessages.map((msg) => (
                  <tr key={msg.id || `${msg.email}-${msg.createdAt}`}>
                    <td className="px-4 py-2 text-sm text-charcoal whitespace-normal break-words leading-tight">
                      <div className="flex items-center gap-2">
                        <span>{msg.name || 'Unknown'}</span>
                        {!msg.isRead && (
                          <span className="notif-circle inline-flex h-2 w-2 rounded-ui bg-soft-gold ring-1 ring-deep-ocean/20" aria-label="Unread message" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-charcoal">
                      {getTypeLabel(msg.type)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        type="button"
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                        onClick={() => openMessage(msg)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-driftwood/50">
                <thead className="bg-linen/70">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Received</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Name</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Email</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Image</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Type</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-driftwood/40 bg-white/80">
                  {sortedMessages.map((msg) => (
                    <tr key={msg.id || `${msg.email}-${msg.createdAt}`}>
                      <td className="px-4 py-2 text-sm text-charcoal/70">
                        {msg.createdAt ? formatEasternDateTime(msg.createdAt) : '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-charcoal">
                        <div className="flex items-center gap-2">
                          <span>{msg.name || 'Unknown'}</span>
                          {!msg.isRead && (
                            <span className="notif-circle inline-flex h-2 w-2 rounded-ui bg-soft-gold ring-1 ring-deep-ocean/20" aria-label="Unread message" />
                          )}
                        </div>
                      </td>
                    
                      <td className="px-4 py-2 text-sm text-charcoal">{msg.email || '-'}</td>
                      <td className="px-4 py-3">
                        {msg.imageUrl ? (
                          <img
                            src={msg.imageUrl}
                            alt={msg.name || 'Message image'}
                            className="h-10 w-10 rounded-shell border border-driftwood/60 object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-charcoal/40">No Image</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold text-deep-ocean">
                          {getTypeLabel(msg.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="lux-button--ghost px-3 py-1 text-[10px]"
                          onClick={() => openMessage(msg)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen} contentClassName="max-w-3xl">
        <DialogContent className="relative p-0">
          <div className="sticky top-0 z-10 border-b border-[var(--ca-border)] bg-white px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4 pr-24">
              <div className="min-w-0">
                <p className="ca-admin-eyebrow mb-1">Message</p>
                <h2 className="ca-admin-heading truncate text-3xl leading-tight">
                  {selectedMessage?.name || 'Message Details'}
                </h2>
                {selectedMessage && (
                  <p className="ca-admin-subheading mt-1 text-sm">
                    {getTypeLabel(selectedMessage.type)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
            <button
              type="button"
              onClick={handleDeleteMessage}
              className="ca-admin-button-danger px-2.5 py-1 text-[10px]"
              aria-label="Delete message"
              title="Delete message"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleCloseDialog}
              className="ca-admin-button-secondary px-3 py-1 text-[10px]"
            >
              CLOSE
            </button>
          </div>

          <div className="max-h-[calc(92vh-86px)] overflow-y-auto overflow-x-hidden px-5 py-5 sm:px-6">
            {selectedMessage && (
              <div className="space-y-5">
                {selectedMessage.type === 'custom_order' && onCreateCustomOrderFromMessage && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleCreateCustomOrder}
                      className="ca-admin-button-primary px-4 py-2 text-[10px]"
                    >
                      Create Custom Order
                    </button>
                  </div>
                )}

                <section className="ca-admin-card-soft p-4">
                  <h3 className="ca-admin-heading mb-4 text-xl">Contact Details</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="lux-label text-[10px]">Name</p>
                      <p className="mt-1 text-sm text-[var(--ca-ink)]">{selectedMessage.name || 'Unknown'}</p>
                    </div>
                    <div>
                      <p className="lux-label text-[10px]">Email</p>
                      {selectedMessage.email ? (
                        <div className="mt-1 flex min-w-0 items-center gap-2">
                          <p className="min-w-0 break-all text-sm text-[var(--ca-ink)]">{selectedMessage.email}</p>
                          <button
                            type="button"
                            className="ca-admin-button-secondary shrink-0 px-2 py-1 text-[10px]"
                            onClick={() => copyEmailToClipboard(selectedMessage.email)}
                            aria-label="Copy email address"
                            title="Copy email address"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-[var(--ca-muted)]">-</p>
                      )}
                    </div>
                    <div>
                      <p className="lux-label text-[10px]">Phone</p>
                      <p className="mt-1 text-sm text-[var(--ca-ink)]">
                        {formatPhoneForDisplay(selectedMessage.phone) || (
                          <span className="text-[var(--ca-muted)]">-</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="lux-label text-[10px]">Date</p>
                      <p className="mt-1 text-sm text-[var(--ca-ink)]">
                        {selectedMessage.createdAt ? formatEasternDateTime(selectedMessage.createdAt) : (
                          <span className="text-[var(--ca-muted)]">-</span>
                        )}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="ca-admin-card-soft p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="ca-admin-heading text-xl">Message</h3>
                    <span className="ca-admin-badge px-3 py-1">{getTypeLabel(selectedMessage.type)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--ca-ink)]">
                    {selectedMessage.message || '-'}
                  </p>

                  {selectedMessage.type === 'custom_order' && (
                    <div className="mt-4 border-t border-[var(--ca-border)] pt-4">
                      <p className="lux-label text-[10px]">Categories</p>
                      {selectedMessage.categoryNames && selectedMessage.categoryNames.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedMessage.categoryNames.map((category) => (
                            <span
                              key={`${selectedMessage.id}-category-${category}`}
                              className="ca-admin-badge px-3 py-1"
                            >
                              {category}
                            </span>
                          ))}
                        </div>
                      ) : selectedMessage.categoryName ? (
                        <p className="mt-1 text-sm text-[var(--ca-ink)]">{selectedMessage.categoryName}</p>
                      ) : (
                        <p className="mt-1 text-sm text-[var(--ca-muted)]">None selected</p>
                      )}
                    </div>
                  )}
                </section>

                {selectedMessage.type === 'custom_order' &&
                  (selectedMessage.inspoTitle || selectedMessage.inspoImageUrl) && (
                    <section className="ca-admin-card-soft p-4">
                      <p className="lux-label text-[10px] mb-3">Inspired By</p>
                      <div className="flex items-center gap-3">
                        {selectedMessage.inspoImageUrl && (
                          <img
                            src={selectedMessage.inspoImageUrl}
                            alt={selectedMessage.inspoTitle || 'Inspiration'}
                            className="h-14 w-14 border border-[var(--ca-border)] object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-[var(--ca-ink)]">
                            {selectedMessage.inspoTitle || 'Custom inspiration'}
                          </p>
                          {selectedMessage.inspoImageUrl && (
                            <a
                              href={selectedMessage.inspoImageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex text-xs font-medium uppercase tracking-[0.18em] text-[var(--ca-navy)] hover:underline"
                            >
                              View Image
                            </a>
                          )}
                        </div>
                      </div>
                    </section>
                  )}

                {selectedMessage.imageUrl && (
                  <section className="ca-admin-card-soft p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="ca-admin-heading text-xl">Reference Image</h3>
                      <a
                        href={selectedMessage.imageUrl}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ca-admin-button-secondary px-3 py-2 text-[10px]"
                      >
                        Download Image
                      </a>
                    </div>
                    <div className="border border-[var(--ca-border)] bg-white p-2">
                      <img
                        src={selectedMessage.imageUrl}
                        alt={selectedMessage.name || 'Uploaded image'}
                        className="block h-auto max-h-[58vh] w-full object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        title="Are you sure?"
        description="This will permanently delete this message."
        confirmText={isDeleting ? 'Deleting...' : 'Confirm'}
        cancelText="Cancel"
        confirmVariant="danger"
        confirmDisabled={isDeleting}
        cancelDisabled={isDeleting}
        onCancel={() => {
          if (!isDeleting) setIsDeleteConfirmOpen(false);
        }}
        onConfirm={confirmDeleteMessage}
      />
    </div>
  );
};
