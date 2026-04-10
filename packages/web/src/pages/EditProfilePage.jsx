/**
 * Edit Profile page — dedicated page for editing display name, username, bio, avatar.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { getUser, fetchMe } from '../sdk/authApi';
import { updateProfile } from '../sdk/contentApi';

export function EditProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();
  const isLoggedIn = !!user;

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn) return;
    setDisplayName(user?.displayName || user?.name || '');
    setUsername(user?.username || '');
    setBio(user?.bio || '');
    setAvatarUrl(user?.avatarUrl || '');
  }, [isLoggedIn, user?.displayName, user?.username, user?.bio, user?.avatarUrl]);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await updateProfile({ displayName, username, bio, avatarUrl });
      await fetchMe();
      setMessage(t('profilePage.profileUpdated'));
      setTimeout(() => navigate('/profile'), 1200);
    } catch (err) {
      setError(err.message || err.data?.message || t('profilePage.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <p className="text-[var(--text-muted)] mb-4">{t('profilePage.notLoggedIn')}</p>
        <Link to="/login" className="text-[var(--accent)] hover:underline">{t('profilePage.signIn')}</Link>
      </div>
    );
  }

  return (
    <>
      <SEO title={t('profilePage.editProfileTitle')} path="/profile/edit" />
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to="/profile" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
            ← {t('common.back')}
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-[var(--text)] mb-6">{t('profilePage.editProfileTitle')}</h1>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">{t('profilePage.fieldDisplayName')}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('profilePage.fieldDisplayName')}
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              maxLength={60}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">{t('profilePage.fieldUsername')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('profilePage.fieldUsername')}
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">{t('profilePage.fieldUsernameHint', '3–30 chars, lowercase letters, numbers, underscores')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">{t('profilePage.fieldBio')}</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('profilePage.fieldBioPlaceholder')}
              rows={4}
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">{bio.length}/500</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">{t('profilePage.fieldAvatarUrl')}</label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          {message && (
            <p className="text-sm text-emerald-500">{message}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {saving ? '…' : t('common.save')}
            </button>
            <Link
              to="/profile"
              className="px-6 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text)] font-medium hover:bg-[var(--bg-elevated)]"
            >
              {t('common.cancel')}
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
