import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, MapPin, History, User, ShoppingBag, ShoppingBasket } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export default function Navbar({ onChangeLocation }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 bg-background border-b border-border">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center gap-4">
        {/* Wordmark — solid blue color-block logo + bold Outfit */}
        <Link
          to="/"
          className="flex items-center gap-2.5 group
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
            focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md
            bg-primary text-primary-foreground">
            <ShoppingBag size={18} strokeWidth={2.5} />
          </span>
          <span className="font-display text-2xl font-extrabold tracking-tight leading-none">
            Save<span className="text-primary">Qart</span>
          </span>
        </Link>

        {user && (
          <button
            onClick={onChangeLocation}
            className="hidden sm:flex items-center gap-2 ml-2 px-3 h-10 rounded-md bg-muted
              text-sm font-medium text-foreground max-w-[260px]
              transition-colors duration-200 hover:bg-border
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            title="Change location"
          >
            <MapPin size={15} strokeWidth={2.5} className="text-primary shrink-0" />
            <span className="truncate">{user.location?.label || 'Set location'}</span>
          </button>
        )}

        <nav className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <NavLink
                to="/basket"
                className={({ isActive }) =>
                  `btn-ghost text-sm ${isActive ? 'bg-muted text-primary' : ''}`
                }
              >
                <ShoppingBasket size={16} strokeWidth={2.5} /> <span className="hidden sm:inline">Basket</span>
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) =>
                  `btn-ghost text-sm ${isActive ? 'bg-muted text-primary' : ''}`
                }
              >
                <History size={16} strokeWidth={2.5} /> <span className="hidden sm:inline">History</span>
              </NavLink>
              <div className="hidden md:flex items-center gap-2 px-2 text-sm font-medium
                text-muted-foreground">
                <User size={15} strokeWidth={2.5} /> {user.name}
              </div>
              <button
                className="btn-ghost text-sm"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                <LogOut size={16} strokeWidth={2.5} /> Logout
              </button>
              <ThemeToggle />
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost text-sm">
                Login
              </Link>
              <Link to="/signup" className="btn-primary text-sm">
                Sign up
              </Link>
              <ThemeToggle />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
