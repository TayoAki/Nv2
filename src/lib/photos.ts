import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform } from 'react-native';

import type { LocalPhoto } from '@/api';

import { confirm } from './confirm';

export type PickResult =
  | { status: 'picked'; photos: LocalPhoto[] }
  | { status: 'cancelled' }
  | { status: 'denied'; source: 'camera' | 'library' };

type PickOptions = { multiple?: boolean; limit?: number };

function toLocalPhoto(asset: ImagePicker.ImagePickerAsset): LocalPhoto {
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize,
    mimeType: asset.mimeType,
  };
}

/**
 * Opens the photo library for photos the shopper chooses. The app never reads the whole
 * library (plan section 12) and strips EXIF by not requesting it.
 */
export async function pickFromLibrary({ multiple = false, limit = 10 }: PickOptions = {}): Promise<PickResult> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted && permission.accessPrivileges !== 'limited') {
      return { status: 'denied', source: 'library' };
    }
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? limit : 1,
    quality: 0.85,
    exif: false,
  });
  if (result.canceled || result.assets.length === 0) return { status: 'cancelled' };
  return { status: 'picked', photos: result.assets.map(toLocalPhoto) };
}

export async function takePhoto(): Promise<PickResult> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied', source: 'camera' };
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, exif: false });
  if (result.canceled || result.assets.length === 0) return { status: 'cancelled' };
  return { status: 'picked', photos: result.assets.map(toLocalPhoto) };
}

/** Explains a denied permission and offers to open system settings. */
export async function explainDeniedPermission(source: 'camera' | 'library') {
  const open = await confirm({
    title: source === 'camera' ? 'Camera access is off' : 'Photo access is off',
    message:
      source === 'camera'
        ? 'To take a photo, allow camera access for Nyoni Couture in Settings. You can also choose an existing photo instead.'
        : 'To choose a photo, allow photo access for Nyoni Couture in Settings. Only the photos you pick are used.',
    confirmLabel: 'Open Settings',
    cancelLabel: 'Not now',
  });
  if (open) Linking.openSettings().catch(() => undefined);
}

/** Client-side checks from the plan's input pipeline; the server re-validates everything. */
export function validatePersonPhoto(photo: LocalPhoto): string | null {
  if (photo.fileSize && photo.fileSize > 10 * 1024 * 1024) {
    return 'This photo is larger than 10 MB. Choose a smaller photo.';
  }
  if (photo.mimeType && !/jpe?g|png|heic|heif|webp/i.test(photo.mimeType)) {
    return 'Use a JPEG, PNG or HEIC photo.';
  }
  if (photo.width && photo.height && Math.min(photo.width, photo.height) < 400) {
    return 'This photo is too small. Use a clearer, full-body photo.';
  }
  if (photo.width && photo.height && photo.width > photo.height * 1.2) {
    return 'Use a portrait photo that shows your full body, head to feet.';
  }
  return null;
}
