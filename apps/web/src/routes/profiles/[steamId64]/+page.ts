import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params }) => {
  return {
    path: `/profiles/${params.steamId64}`,
  };
};
