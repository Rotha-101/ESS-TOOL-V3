import localforage from 'localforage';

// Initialize core store
localforage.config({
  name: 'ESS_Toolbox_Platform',
  storeName: 'ess_unified_store',
  description: 'Unified storage for ESS Toolbox Large Datasets'
});

export const setDBItem = async (key: string, value: any): Promise<void> => {
  try {
    await localforage.setItem(key, value);
  } catch (err) {
    console.error('Error saving to localforage:', key, err);
  }
};

export const getDBItem = async <T>(key: string): Promise<T | null> => {
  try {
    const value = await localforage.getItem<T>(key);
    return value;
  } catch (err) {
    console.error('Error reading from localforage:', key, err);
    return null;
  }
};

export const removeDBItem = async (key: string): Promise<void> => {
  try {
    await localforage.removeItem(key);
  } catch (err) {
    console.error('Error removing from localforage:', key, err);
  }
};
