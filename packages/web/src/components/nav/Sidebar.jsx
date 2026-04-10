import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getUser } from '../../sdk/authApi';

export default function Sidebar() {
  const navigate = useNavigate();
  const user = getUser();

  const myCreatorId = useMemo(() => {
    if (!user) return null;
    return user.id || user._id || null;
  }, [user]);

  const myStoreHref = myCreatorId ? `/creator/${encodeURIComponent(myCreatorId)}/shop` : '/login';

  return (
    <div className="w-64 bg-[#0f0f0f] p-4">
      <Link to="/" className="block mb-3 font-semibold">
        Home
      </Link>
      <Link to="/upload" className="block mb-3 font-semibold">
        Upload
      </Link>
      <Link to="/live/schedule" className="block mb-3 font-semibold">
        Go Live
      </Link>

      <Link
        to={myStoreHref}
        className="block mb-3 font-semibold"
        onClick={(e) => {
          if (!myCreatorId) {
            e.preventDefault();
            navigate('/login', { state: { from: '/store/me' } });
          }
        }}
      >
        My Store
      </Link>

      <Link to="/creator/studio" className="block font-semibold">
        Studio
      </Link>
    </div>
  );
}

