import React, { useState } from 'react';
import './index.css';

function App() {
  const [count, setCount] = useState(0);

  const increment = () => {
    setCount(count + 1);
  };

  const decrement = () => {
    setCount(count - 1);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        <h1 className="text-4xl font-bold mb-4">Counter</h1>
        <p className="text-6xl font-semibold mb-6">{count}</p>
        <div className="space-x-4">
          <button
            onClick={decrement}
            className="px-6 py-3 bg-red-500 text-white rounded-lg text-lg font-medium hover:bg-red-600 transition-colors duration-200"
          >
            Decrement
          </button>
          <button
            onClick={increment}
            className="px-6 py-3 bg-green-500 text-white rounded-lg text-lg font-medium hover:bg-green-600 transition-colors duration-200"
          >
            Increment
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
