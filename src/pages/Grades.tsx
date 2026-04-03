import React, { useState } from 'react';
import { GradesList } from '../components/GradesList';

const Grades = () => {
    const [marks, setMarks] = useState({});

    const handleMarkChange = (subject) => (event) => {
        if (event.key === 'Enter') {
            setMarks({ ...marks, [subject]: event.target.value });
        }
    };

    return (
        <div>
            <h1>Grades</h1>
            <GradesList marks={marks} />
            <input 
                type="text" 
                onKeyDown={handleMarkChange('Math')} 
                placeholder="Enter Math mark" 
            />
        </div>
    );
};

export default Grades;