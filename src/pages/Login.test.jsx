// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Mocks (hoisted): keep the test off Firebase / router / analytics ---
const mockNavigate = vi.fn();
const mockGoogleLogin = vi.fn(() => Promise.resolve());
const mockTrack = vi.fn();

// Mutable auth value so each test can shape useAuth()'s return.
let authValue;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authValue,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../lib/analytics', () => ({
  track: (...args) => mockTrack(...args),
}));

// Import AFTER mocks are declared (vi.mock is hoisted above imports anyway).
import Login from './Login';

beforeEach(() => {
  mockNavigate.mockClear();
  mockGoogleLogin.mockClear();
  mockGoogleLogin.mockImplementation(() => Promise.resolve());
  mockTrack.mockClear();
  authValue = { googleLogin: mockGoogleLogin, currentUser: null, authError: null };
});

afterEach(() => cleanup());

describe('Login', () => {
  it('renders the value-prop copy: headline, tagline, and blurb', () => {
    render(<Login />);

    expect(screen.getByRole('heading', { name: 'TITAN' })).toBeInTheDocument();
    expect(screen.getByText('Your AI fitness & diet coach.')).toBeInTheDocument();
    expect(
      screen.getByText(/Track workouts, log meals, and hit your macros/i)
    ).toBeInTheDocument();
  });

  it('renders the three feature labels (Workouts / Diet / AI Coach)', () => {
    render(<Login />);

    expect(screen.getByText('Workouts')).toBeInTheDocument();
    expect(screen.getByText('Diet')).toBeInTheDocument();
    expect(screen.getByText('AI Coach')).toBeInTheDocument();
  });

  it('renders the "Free" reassurance line', () => {
    render(<Login />);

    expect(
      screen.getByText('Free · No credit card · Your data stays yours')
    ).toBeInTheDocument();
  });

  it('calls googleLogin when the Google button is clicked (and tracks it)', async () => {
    const user = userEvent.setup();
    render(<Login />);

    const btn = screen.getByRole('button', { name: /sign in with google/i });
    await user.click(btn);

    expect(mockGoogleLogin).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mockTrack).toHaveBeenCalledWith('login', { method: 'google' })
    );
  });

  it('renders authError in the error box when set', () => {
    authValue = {
      googleLogin: mockGoogleLogin,
      currentUser: null,
      authError: 'Redirect sign-in failed.',
    };
    render(<Login />);

    expect(screen.getByText('Redirect sign-in failed.')).toBeInTheDocument();
    // Sanity: the friendly no-error state should NOT show this text.
    cleanup();
    authValue.authError = null;
    render(<Login />);
    expect(screen.queryByText('Redirect sign-in failed.')).not.toBeInTheDocument();
  });

  it('navigates to "/" when currentUser is already set', () => {
    authValue = {
      googleLogin: mockGoogleLogin,
      currentUser: { uid: 'abc123' },
      authError: null,
    };
    render(<Login />);

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('does NOT navigate when there is no currentUser', () => {
    render(<Login />);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
