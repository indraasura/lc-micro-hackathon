// 1. DATABASE CONNECTIVITY PRESETS
const SUPABASE_URL = 'https://gjvtglumwbhjeutekynb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdnRnbHVtd2JoamV1dGVreW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMzA2MDQsImV4cCI6MjA5NzkwNjYwNH0.s1h5haWYgogoQXKPdY_ifSEeZJHRHQKmbBVEruU7pOI'; // Replace with your actual anon key string
const MASTER_PASSWORD = 'itfeelsgoodtobetheking';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let globalTeamsList = [];
let authenticatedTeamId = null;
let timerInterval = null;

// 2. TIMING DEFINITION TARGET CONFIGURATION
// Target: Monday, June 29, 2026 at 4:05 PM IST (UTC+5:30)
function getTargetTime() {
    return new Date('2026-06-29T16:05:00+05:30');
}

const targetCountdownDate = getTargetTime().getTime();

window.onload = () => {
    evaluateApplicationState();
};

function evaluateApplicationState() {
    const now = new Date().getTime();
    const distance = targetCountdownDate - now;

    if (distance > 0) {
        switchScreenState('countdownScreen');
        runCountdownEngine();
    } else {
        switchScreenState('welcomeScreen');
    }
}

function switchScreenState(screenId) {
    document.querySelectorAll('.state-screen').forEach(s => s.classList.remove('active'));
    const element = document.getElementById(screenId);
    element.classList.add('active');
}

function runCountdownEngine() {
    timerInterval = setInterval(() => {
        const now = new Date().getTime();
        const distance = targetCountdownDate - now;

        if (distance <= 0) {
            clearInterval(timerInterval);
            switchScreenState('welcomeScreen');
            return;
        }

        const hours = Math.floor(distance / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        document.getElementById('hr').textContent = String(hours).padStart(2, '0');
        document.getElementById('min').textContent = String(minutes).padStart(2, '0');
        document.getElementById('sec').textContent = String(seconds).padStart(2, '0');
    }, 1000);
}

async function transitionToDashboard() {
    switchScreenState('dashboardScreen');
    await initializeBaseContext();
    setupRealtimePipeline();
}

async function initializeBaseContext() {
    const { data, error } = await supabaseClient.from('teams').select('*').order('id', { ascending: true });
    if (error) return console.error(error);

    globalTeamsList = data;
    populateIdentityDropdown();
    await calculateAndRenderStandings();
}

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

// Clears out active panel access when changing selected dropdown identity
function clearAuthAndSheet() {
    authenticatedTeamId = null;
    document.getElementById('teamPassword').value = '';
    document.getElementById('authFeedback').style.display = 'none';
    document.getElementById('teamsContainer').innerHTML = `
                <div style="color: var(--text-muted); font-size: 0.95rem; font-style: italic; border: 1px dashed var(--border-color); padding: 24px; border-radius: 12px; text-align: center;">
                    Please enter your team password above to unlock your scoring sheet.
                </div>`;
}

// Validate password input with the record in the database
async function authenticateTeam() {
    const currentTeamId = parseInt(document.getElementById('teamSelector').value, 10);
    const inputPassword = document.getElementById('teamPassword').value;
    const feedback = document.getElementById('authFeedback');

    // Find match inside global loaded cache structure
    const selectedTeamObj = globalTeamsList.find(t => t.id === currentTeamId);

    if (selectedTeamObj && selectedTeamObj.password === inputPassword) {
        feedback.style.display = 'none';
        authenticatedTeamId = currentTeamId;
        await loadAndRenderScoringSheet();
    } else {
        authenticatedTeamId = null;
        feedback.style.display = 'block';
        feedback.textContent = 'Invalid team password.';
    }
}

// Render matching peer target listings once password confirms identity context
async function loadAndRenderScoringSheet() {
    if (!authenticatedTeamId) return;

    const container = document.getElementById('teamsContainer');
    container.innerHTML = '';

    const evaluableTargets = globalTeamsList.filter(t => t.id !== authenticatedTeamId);

    // Fetch any historical grades captured from this identifier row context prior
    const { data: currentGrades } = await supabaseClient
        .from('scores')
        .select('*')
        .eq('evaluator_team_id', authenticatedTeamId);

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
                        <input type="number" min="0" max="10" placeholder="0-10" id="score-input-${team.id}" class="input-score" value="${existingValue}">
                        <button class="btn-submit" onclick="submitPeerScore(${team.id})">Save Grade</button>
                    </div>
                `;
        container.appendChild(card);
    });
}

async function submitPeerScore(targetTeamId) {
    // Anti-impersonation system confirmation verification checkpoint check
    if (!authenticatedTeamId) {
        alert('Your identity context token expired or is unverified. Re-enter your password.');
        return;
    }

    const scoreVal = parseInt(document.getElementById(`score-input-${targetTeamId}`).value, 10);

    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 10) {
        alert('Please provide a score between 0 and 10.');
        return;
    }

    const { error } = await supabaseClient
        .from('scores')
        .upsert({
            evaluator_team_id: authenticatedTeamId,
            target_team_id: targetTeamId,
            score_value: scoreVal,
            updated_at: new Date().toISOString()
        }, { onConflict: 'evaluator_team_id,target_team_id' });

    if (error) {
        console.error(error);
        alert('Submission rejected.');
    } else {
        alert('Score captured cleanly.');
    }
}

async function calculateAndRenderStandings() {
    const { data: rawScores, error } = await supabaseClient.from('scores').select('*');
    if (error) return console.error(error);

    const scoreSumMap = {};
    globalTeamsList.forEach(t => scoreSumMap[t.id] = 0);
    rawScores.forEach(s => {
        if (scoreSumMap[s.target_team_id] !== undefined) {
            scoreSumMap[s.target_team_id] += s.score_value;
        }
    });

    const processedList = globalTeamsList.map(t => ({
        name: t.name,
        totalScore: scoreSumMap[t.id]
    })).sort((a, b) => b.totalScore - a.totalScore);

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

function setupRealtimePipeline() {
    supabaseClient
        .channel('realtime-peer-feed')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
            calculateAndRenderStandings();
        })
        .subscribe();
}