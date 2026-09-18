import * as LRU from 'lru-cache';
import StatusBarItem from './ui/statusBarItem';
import { COMMAND_TOGGLE_OUTPUT } from './constants';
import AppState from './modules/appState';
import RemoteExplorer from './modules/remoteExplorer';

interface App {
  fsCache: LRU.Cache<string, string>;
  state: AppState;
  sftpBarItem: StatusBarItem;
  remoteExplorer: RemoteExplorer;
}

const app: App = Object.create(null);

app.state = new AppState();
app.sftpBarItem = new StatusBarItem(
  () => {
    if (app.state.profile) {
      return `NeuraSync: ${app.state.profile}`;
    } else {
      return 'NeuraSync';
    }
  },
  'NeuraSync by Neura Organization',
  COMMAND_TOGGLE_OUTPUT
);
app.fsCache = LRU<string, string>({ max: 6 });

export default app;
