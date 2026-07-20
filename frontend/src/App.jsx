import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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
      
      axios.get('/auth/current-user')
        .then(response => {
          setCurrentUser(response.data);
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
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="App">
      <Routes>
        <Route 
          path="/" 
          element={
            currentUser ? 
              (currentUser.role === 'mama-admin' || currentUser.role === 'papa-admin' || currentUser.role === 'admin' ? 
                <Navigate to="/admin" /> : 
                <Navigate to="/child" />
              ) : 
              <Login onLogin={login} />
          } 
        />
        <Route 
          path="/login" 
          element={
            currentUser ? 
              (currentUser.role === 'mama-admin' || currentUser.role === 'papa-admin' || currentUser.role === 'admin' ? 
                <Navigate to="/admin" /> : 
                <Navigate to="/child" />
              ) : 
              <Login onLogin={login} />
          } 
        />
        <Route 
          path="/admin" 
          element={
            currentUser && (currentUser.role === 'mama-admin' || currentUser.role === 'papa-admin' || currentUser.role === 'admin') ? 
              <AdminDashboard user={currentUser} onLogout={logout} /> : 
              <Navigate to="/login" />
          } 
        />
        <Route 
          path="/child" 
          element={
            currentUser && currentUser.role === 'child' ? 
              <ChildDashboard user={currentUser} onLogout={logout} /> : 
              <Navigate to="/login" />
          } 
        />
      </Routes>
    </div>
  );
}

export default App;