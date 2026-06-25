// 1. SUPABASE PIPELINE CREDENTIALS
const SUPABASE_URL = 'https://gjvtglumwbhjeutekynb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdnRnbHVtd2JoamV1dGVreW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMzA2MDQsImV4cCI6MjA5NzkwNjYwNH0.s1h5haWYgogoQXKPdY_ifSEeZJHRHQKmbBVEruU7pOI';
const MASTER_PASSWORD = 'itfeelsgoodtobetheking';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let globalTeamsList = [];

window.onload = async () => {
    await initializeBaseContext();
    setupRealtimePipeline();
};

// Pull foundational system properties once on load
async function initializeBaseContext() {
    const { data, error } = await supabaseClient.from('teams').select('*').order('id', { ascending: true });
    if (error) return console.error(error);

    globalTeamsList = data;

    populateIdentityDropdown();
    handleIdentityShift(); // Renders appropriate rating lists immediately
    await calculateAndRenderStandings();
}

// Fill "Who are you?" drop down array definitions
function populateIdentityDropdown() {
    const select = document.getElementById('teamSelector');
    select.innerHTML = '';
    globalTeamsList.forEach(team => {
        const opt = document.createElement('option');
        opt.value = team.id;
        opt.textContent = team.name;
        select.appendChild(opt);
    });
}

// Whenever active logging identity changes, change available targets (hide self-grading card)
async function handleIdentityShift() {
    const myTeamId = parseInt(document.getElementById('teamSelector').value, 10);
    const container = document.getElementById('teamsContainer');
    container.innerHTML = '';

    // Filter out self
    const evaluableTargets = globalTeamsList.filter(t => t.id !== myTeamId);

    // Grab any existing grades this selector made prior to setup
    const { data: currentGrades } = await supabaseClient
        .from('scores')
        .select('*')
        .eq('evaluator_team_id', myTeamId);

    evaluableTargets.forEach(team => {
        const existingRecord = currentGrades ? currentGrades.find(g => g.target_team_id === team.id) : null;
        const existingValue = existingRecord ? existingRecord.score_value : '';

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
                    <div class="card-header">
                        <div>
                            <div class="team-title">${team.name}</div>
                            <div class="team-meta">${team.members}</div>
                        </div>
                    </div>
                    <div class="score-input-wrapper">
                        <input type="number" min="0" max="100" placeholder="0-100" id="score-input-${team.id}" class="input-score" value="${existingValue}">
                        <button class="btn-submit" onclick="submitPeerScore(${team.id})">Save Grade</button>
                    </div>
                `;
        container.appendChild(card);
    });
}

// Write entry to relational scores matrix schema
async function submitPeerScore(targetTeamId) {
    const myTeamId = parseInt(document.getElementById('teamSelector').value, 10);
    const scoreVal = parseInt(document.getElementById(`score-input-${targetTeamId}`).value, 10);

    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) {
        alert('Please provide a performance grading weight integer scaling between 0 and 100.');
        return;
    }

    const { error } = await supabaseClient
        .from('scores')
        .upsert({
            evaluator_team_id: myTeamId,
            target_team_id: targetTeamId,
            score_value: scoreVal,
            updated_at: new Date().toISOString()
        }, { onConflict: 'evaluator_team_id,target_team_id' });

    if (error) {
        console.error(error);
        alert('Submission rejected by integrity engine.');
    } else {
        // Flash interaction response feedback indicator
        alert('Score captured cleanly.');
    }
}

// Read global values out of tables safely to build ranking
async function calculateAndRenderStandings() {
    const { data: rawScores, error } = await supabaseClient.from('scores').select('*');
    if (error) return console.error(error);

    // Sum totals
    const scoreSumMap = {};
    globalTeamsList.forEach(t => scoreSumMap[t.id] = 0);
    rawScores.forEach(s => {
        if (scoreSumMap[s.target_team_id] !== undefined) {
            scoreSumMap[s.target_team_id] += s.score_value;
        }
    });

    // Map and Sort
    const processedList = globalTeamsList.map(t => ({
        name: t.name,
        totalScore: scoreSumMap[t.id]
    })).sort((a, b) => b.totalScore - a.totalScore);

    // Display
    const listContainer = document.getElementById('standingsList');
    listContainer.innerHTML = '';

    processedList.forEach((team, idx) => {
        const row = document.createElement('div');
        row.className = 'standing-item';
        row.innerHTML = `
                    <div class="standing-rank-name">
                        <div class="standing-rank">${String(idx + 1).padStart(2, '0')}</div>
                        <div class="standing-name">${team.name}</div>
                    </div>
                    <div class="standing-score">${team.totalScore}</div>
                `;
        listContainer.appendChild(row);
    });
}

// Authorization block validation routine
function verifyAndReveal() {
    const entry = document.getElementById('gatekeeperKey').value;
    const errorElement = document.getElementById('lockError');

    if (entry === MASTER_PASSWORD) {
        document.getElementById('revealOverlay').classList.add('hidden');
        document.getElementById('standingsList').classList.remove('blurred');
    } else {
        errorElement.style.display = 'block';
    }
}

// Live changes listeners pipeline channel assignments
function setupRealtimePipeline() {
    supabaseClient
        .channel('realtime-peer-feed')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
            calculateAndRenderStandings();
        })
        .subscribe();
}