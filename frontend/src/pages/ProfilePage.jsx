import { useState } from "react";
import profilePlaceholder from "../assets/profile-placeholder.svg";
import { useAuth } from "../context/AuthContext.jsx";
import { applyImageFallback } from "../lib/media.jsx";

const PROFILE_PLACEHOLDER = profilePlaceholder;

function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    phone: user?.phone || "",
    email: user?.email || "",
    address: user?.address || "",
    profile_image: null,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (value !== null && value !== undefined) payload.append(key, value);
    });
    try {
      await updateProfile(payload);
      setMessage("Profile updated.");
      setError("");
    } catch (err) {
      setError(JSON.stringify(err.response?.data || "Update failed."));
      setMessage("");
    }
  };

  return (
    <section className="page-wrap">
      <div className="panel profile-card">
        <h2>My Profile</h2>
        <img
          className="avatar"
          src={user?.profile_image_url || PROFILE_PLACEHOLDER}
          alt={user?.full_name || "Profile"}
          data-fallback-src={PROFILE_PLACEHOLDER}
          onError={applyImageFallback}
        />
        <form onSubmit={submit}>
          <input name="full_name" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} placeholder="Full name" />
          <input name="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" />
          <input name="phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone" />
          <input name="address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Address" />
          <input name="profile_image" type="file" accept="image/*" onChange={(e) => setForm((p) => ({ ...p, profile_image: e.target.files?.[0] || null }))} />
          <button className="primary-btn" type="submit">
            Save Profile
          </button>
        </form>
        {message ? <p className="ok">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </section>
  );
}

export default ProfilePage;
