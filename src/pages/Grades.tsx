import React, { useState } from 'react';

const Grades = () => {
    const [marks, setMarks] = useState('');

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            // Save marks logic here
            console.log('Marks saved:', marks);
        }
    };

    const handleChange = (event) => {
        setMarks(event.target.value);
    };

    return (
        <div>
            <h1>Grades</h1>
            <input 
                type="text" 
                value={marks} 
                onChange={handleChange} 
                onKeyDown={handleKeyDown} 
                placeholder="Enter your marks...
            />
        </div>
    );
};

export default Grades;
