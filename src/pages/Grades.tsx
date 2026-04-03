import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const Grades = () => {
    const [grades, setGrades] = useState([]);
    const [modules, setModules] = useState([]);
    const [selectedModule, setSelectedModule] = useState('');

    // Fetch grades and modules from Supabase
    useEffect(() => {
        const fetchGrades = async () => {
            const { data, error } = await supabase
                .from('grades')
                .select('*');
            if (!error) setGrades(data);
        };

        const fetchModules = async () => {
            const { data, error } = await supabase
                .from('modules')
                .select('*');
            if (!error) setModules(data);
        };

        fetchGrades();
        fetchModules();
    }, []);

    // GPA Calculation
    const calculateGPA = () => {
        const totalPoints = grades.reduce((acc, grade) => acc + grade.points, 0);
        return (totalPoints / grades.length).toFixed(2);
    };

    // Handle Module Selection
    const handleModuleChange = (e) => {
        setSelectedModule(e.target.value);
    };

    return (
        <div>
            <h1>Grades Management</h1>
            <label htmlFor='modules'>Filter by Module:</label>
            <select id='modules' value={selectedModule} onChange={handleModuleChange}>
                <option value=''>All Modules</option>
                {modules.map(module => <option key={module.id} value={module.name}>{module.name}</option>) }
            </select>
            <ul>
                {grades.filter(grade => selectedModule ? grade.module === selectedModule : true)
                      .map(grade => (
                          <li key={grade.id}>{grade.name}: {grade.points}</li>
                      ))}
            </ul>
            <h2>GPA: {calculateGPA()}</h2>
        </div>
    );
};

export default Grades;