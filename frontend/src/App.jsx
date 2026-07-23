import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import ChildDashboard from './pages/ChildDashboard';

// Set base URL for API requests
const API_BASE_URL = '/api';

axios.defaults.baseURL = API_BASE_URL;

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in by checking for token in localStorage
    const token = localStorage.getItem('token');
    if (token) {
      // Verify token and get user data
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      axios.get('/auth/me')
        .then(response => {
          setCurrentUser(response.data.user);
        })
        .catch(error => {
          // Token might be invalid/expired, remove it
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const login = (userData, token) => {
    setCurrentUser(userData);
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-slate-400 font-mono">Семейный Банк: Загрузка...</p>
      </div>
    );
  }

  const isAdmin = currentUser && (currentUser.platformRole === 'global_admin' || currentUser.familyRole === 'family_admin');
  const isChild = currentUser && currentUser.familyRole === 'child';

  return (
    <div className="App min-h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      <Routes>
        <Route 
          path="/" 
          element={
            currentUser ? 
              (isAdmin ? <Navigate to="/admin" /> : <Navigate to="/child" />) : 
              <Login onLogin={login} />
          } 
        />
        <Route 
          path="/login" 
          element={
            currentUser ? 
              (isAdmin ? <Navigate to="/admin" /> : <Navigate to="/child" />) : 
              <Login onLogin={login} />
          } 
        />
        <Route 
          path="/admin" 
          element={
            isAdmin ? 
              <AdminDashboard user={currentUser} onLogout={logout} /> : 
              <Navigate to="/login" />
          } 
        />
        <Route 
          path="/child" 
          element={
            isChild ? 
              <ChildDashboard user={currentUser} onLogout={logout} /> : 
              <Navigate to="/login" />
          } 
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

export default App;