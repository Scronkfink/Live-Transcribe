import React from "react";
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Splash from './Splash';
import User from "./User"
import './styles/app.css';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/user" element={<User />} />
      </Routes>
    </Router>
  );
}

export default App;