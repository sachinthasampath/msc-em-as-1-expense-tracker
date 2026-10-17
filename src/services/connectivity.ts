import { useNetInfo } from '@react-native-community/netinfo';

export function useIsOnline(): boolean {
  const state = useNetInfo();
  // isInternetReachable distinguishes "attached to a wifi AP" from "actually has internet" —
  // a captive portal reports isConnected: true and would otherwise send the sync engine into a
  // retry loop against a login page. It is null while unknown; treat null as online and let the
  // request itself fail rather than blocking writes.
  return state.isConnected === true && state.isInternetReachable !== false;
}
