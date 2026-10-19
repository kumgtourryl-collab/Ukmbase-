export const state = {
    currentUser: null,
    currentProfile: null,
    projectsCache: [],
    connectionsCache: [],
    teamCache: [],
    chatHistory: [],
    
    // UkmData State
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
    lastGeneratedSQL: ''
};
