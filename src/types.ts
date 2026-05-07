export interface Link {
  id: string;
  label: string;
  url: string;
  icon?: string;
}

export interface Folder {
  id: string;
  title: string;
  icon: string;
  links: Link[];
  folders?: Folder[];
  color?: string;
}

export interface Config {
  folders: Folder[];
  appearance: {
    theme: 'light' | 'dark' | 'glass';
    background?: string;
    displayName?: string;
  };
}
