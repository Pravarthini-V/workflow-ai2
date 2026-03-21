import React, { useState } from 'react';
import { signInWithGoogle } from './supabase';

function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    
    try {
      console.log('Login button clicked');
      await signInWithGoogle();
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to sign in with Google');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.box}>
        <h1 style={styles.title}>🚀 Workflow Assistant</h1>
        <p style={styles.subtitle}>Welcome Employee! Great to see you!</p>
        
        {error && <div style={styles.error}>{error}</div>}
        
        <button 
          onClick={handleGoogleLogin} 
          style={styles.googleBtn}
          disabled={loading}
        >
          <img 
            src="https://www.google.com/favicon.ico" 
            alt="Google" 
            style={styles.googleIcon}
          />
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>
      </div>
      
      {/* 3D Effect Circles */}
      <div style={styles.circle1}></div>
      <div style={styles.circle2}></div>
      <div style={styles.circle3}></div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  },
  box: {
    background: 'white',
    padding: '40px',
    borderRadius: '10px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    textAlign: 'center',
    width: '350px',
    position: 'relative',
    zIndex: 10,
    transform: 'perspective(1000px) rotateX(2deg)',
    border: '1px solid rgba(255,255,255,0.2)'
  },
  title: {
    fontSize: '28px',
    color: '#333',
    marginBottom: '10px',
    fontWeight: 'bold'
  },
  subtitle: {
    color: '#666',
    marginBottom: '30px',
    fontSize: '16px'
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '12px',
    backgroundColor: 'white',
    border: '2px solid #e0e0e0',
    borderRadius: '5px',
    fontSize: '16px',
    fontWeight: '500',
    color: '#333',
    cursor: 'pointer',
    transition: 'all 0.3s',
    gap: '10px',
    opacity: loading => loading ? 0.7 : 1
  },
  googleIcon: {
    width: '20px',
    height: '20px'
  },
  error: {
    backgroundColor: '#ffebee',
    color: '#c62828',
    padding: '10px',
    borderRadius: '5px',
    marginBottom: '20px',
    fontSize: '14px'
  },
  circle1: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.1)',
    top: '-100px',
    right: '-100px',
    zIndex: 1
  },
  circle2: {
    position: 'absolute',
    width: '300px',
    height: '300px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.1)',
    bottom: '-50px',
    left: '-50px',
    zIndex: 1
  },
  circle3: {
    position: 'absolute',
    width: '200px',
    height: '200px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.1)',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 0
  }
};

export default Login;