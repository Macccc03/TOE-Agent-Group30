import { breakpoints } from "@phoenix/constants/breakpoints";
import { usePreferencesContext } from "@phoenix/contexts/PreferencesContext";
import { useMediaQuery } from "@phoenix/hooks/useMediaQuery";

/**
 * Below this width the expanded side nav leaves too little room for page
 * content, so the viewport temporarily overrides the user's saved preference.
 */
export const SIDE_NAV_EXPANSION_MEDIA_QUERY = `(min-width: ${breakpoints.lg}px)`;

export function useResponsiveSideNav() {
  const { isSideNavExpansionPreferred, setIsSideNavExpanded } =
    usePreferencesContext((state) => ({
      isSideNavExpansionPreferred: state.isSideNavExpanded,
      setIsSideNavExpanded: state.setIsSideNavExpanded,
    }));
  const isSideNavExpansionAllowed = useMediaQuery(
    SIDE_NAV_EXPANSION_MEDIA_QUERY
  );
  const isSideNavExpanded =
    isSideNavExpansionAllowed && isSideNavExpansionPreferred;

  return {
    isSideNavExpanded,
    isSideNavExpansionAllowed,
    setIsSideNavExpanded,
  };
}
