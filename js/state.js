export const state = {
    currentUser: null,
    currentProfile: null,
    showingDashboardFor: null,
    pendingInvite: null,
    authMode: 'login',
    inRecoveryMode: false,
    
    projectsCache: [],
    connectionsCache: [],
    teamCache: [],
    chatHistory: [],
    
    currentUkmDataProjectId: null,
    ukmDataSchema: null,
    ukmDataTables: [],
    ukmDataUsers: [],
    ukmDataFiles: [],
    ukmDataColumnCounter: 0,
    currentTableData: [],
    currentTableName: null,
    editingRowId: null,
    currentChartData: null,
    currentSeedTable: null,
    impersonatingUserId: null,
    
    currentSyncProjectId: null,
    syncConfigCache: null,
    activeConnection: null,
    lastGeneratedSQL: '',
    allUsersCache: [],
    viewingProjectId: null,
    currentUpgradePlan: null
};
