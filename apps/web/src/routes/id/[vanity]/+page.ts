import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params }) => {
  return {
    path: `/id/${params.vanity}`,
  };
};
