'use strict';
module.exports = {
  useNavigation:     () => ({ navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() }),
  useRoute:          () => ({ params: {} }),
  useFocusEffect:    jest.fn((cb) => cb()),
  createNativeStackNavigator: () => ({ Navigator: 'Navigator', Screen: 'Screen' }),
  createBottomTabNavigator:   () => ({ Navigator: 'Navigator', Screen: 'Screen' }),
  NavigationContainer: ({ children }) => children,
};
