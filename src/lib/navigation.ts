import { router, type useNavigationContainerRef } from 'expo-router';
import { CommonActions, type NavigationState, type PartialState } from 'expo-router/react-navigation';

type NavigationRef = ReturnType<typeof useNavigationContainerRef>;
type AnyState = NavigationState | PartialState<NavigationState>;

/** The mounted navigator that has `routeName` among its screens, searched from the root. */
function findNavigator(state: AnyState | undefined, routeName: string): NavigationState | undefined {
  if (!state) return undefined;
  if (state.stale === false && state.routeNames.includes(routeName)) return state;
  for (const route of state.routes) {
    const found = findNavigator(route.state, routeName);
    if (found) return found;
  }
  return undefined;
}

/**
 * Starts navigation over at the Shop home with a fresh stack in every tab, so no screen keeps
 * local state from before (used after the demo data is reset). `router.dismissTo` can't do
 * this: tab navigators ignore its POP_TO action.
 */
export function resetToShop(navigationRef: NavigationRef) {
  const appStack = findNavigator(navigationRef.getRootState(), '(tabs)');
  if (!appStack) {
    router.navigate('/shop');
    return;
  }
  navigationRef.dispatch({
    ...CommonActions.reset({
      index: 0,
      routes: [{ name: '(tabs)', state: { index: 0, routes: [{ name: '(shop)' }] } }],
    }),
    target: appStack.key,
  });
}
