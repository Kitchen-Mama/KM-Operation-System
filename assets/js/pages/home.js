// ========================================
// Home Page Logic
// 從 app.js 搬移，不改行為
// ========================================

function renderHomepage() {
    renderEvents();
    renderGoal();
    renderRow2();
}

function renderRow2() {
    renderAnnouncements();
    renderUrgentIssues();
    renderPersonalTodos();
}

function renderAnnouncements() {
    const announcements = window.DataRepo.getAnnouncements();
    const announcementsList = document.getElementById('announcementsList');
    announcementsList.innerHTML = announcements.map(item => `
        <div class="announcement-item">
            <div class="item-title">${item.title}</div>
            <div class="item-time">${item.time}</div>
        </div>
    `).join('');
}

function renderUrgentIssues() {
    const urgentIssues = window.DataRepo.getUrgentIssues();
    const urgentIssuesList = document.getElementById('urgentIssuesList');
    urgentIssuesList.innerHTML = urgentIssues.map(item => `
        <div class="urgent-item">
            <div class="item-title">${item.title}</div>
        </div>
    `).join('');
}

function renderPersonalTodos() {
    const todos = window.DataRepo.getPersonalTodos();
    const todoList = document.getElementById('todoList');
    todoList.innerHTML = todos.map(todo => `
        <div class="todo-item">${todo.text}</div>
    `).join('');
}

function addTodo() {
    const input = document.getElementById('todoInput');
    const todoText = input.value.trim();
    if (todoText) {
        window.DataRepo.addPersonalTodo(todoText);
        input.value = '';
        renderPersonalTodos();
    }
}

function handleTodoEnter(event) {
    if (event.key === 'Enter') {
        addTodo();
    }
}

function renderEvents() {
    const events = window.DataRepo.getEvents();
    const eventsList = document.getElementById('eventsList');
    eventsList.innerHTML = events.map(event => `
        <div class="event-card">
            <div class="event-row">
                <span class="event-label">\u6d3b\u52d5\u540d\u7a31</span>
                <span>${event.name}</span>
            </div>
            <div class="event-row">
                <span class="event-label">\u6d3b\u52d5\u671f\u9593</span>
                <span>${event.startDate}~${event.endDate}</span>
            </div>
            <div class="event-row">
                <span class="event-label">Content</span>
                <span>${event.content}</span>
            </div>
        </div>
    `).join('');
}

function renderGoal() {
    const goal = window.DataRepo.getGoalData();
    const achievementRate = Math.round((goal.salesAmount / goal.goalAmount) * 100);
    document.getElementById('goalYear').textContent = `${goal.year} Goal`;
    document.getElementById('achievementRate').textContent = `${achievementRate}%`;
    document.getElementById('goalAmount').textContent = `Goal: $${goal.goalAmount.toLocaleString()}`;
    document.getElementById('salesAmount').textContent = `Sales: $${goal.salesAmount.toLocaleString()}`;
    document.getElementById('progressFill').style.width = `${achievementRate}%`;
    document.getElementById('progressText').textContent = `${achievementRate}%`;
}

function showHome() {
    document.getElementById('home-section').style.display = 'block';
    document.getElementById('world-time-bar').style.display = 'flex';
    document.querySelectorAll('.module-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
}

// 暴露到全域
window.renderHomepage = renderHomepage;
window.showHome = showHome;
window.addTodo = addTodo;
window.handleTodoEnter = handleTodoEnter;


// ========================================
// Lifecycle 註冊
// ========================================
if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('home-section', {
        mount() {
            console.log('[Home] mount');
            renderHomepage();
        },
        unmount() {
            console.log('[Home] unmount');
        }
    });
}
