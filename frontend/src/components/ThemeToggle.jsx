import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.jsx';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={`inline-flex h-12 w-12 items-center justify-center rounded-md
        bg-muted text-foreground transition-colors duration-200
        hover:bg-border
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
    >
      {isDark ? <Sun size={20} strokeWidth={2.5} /> : <Moon size={20} strokeWidth={2.5} />}
    </button>
  );
}
