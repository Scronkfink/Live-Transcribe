import React from "react";
import { useState } from "react";
import { useNavigate } from 'react-router-dom';
// import "./styles/app.css";
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { ArrowUpTrayIcon } from '@heroicons/react/24/solid'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'

const baseURL = process.env.BASE_URL

const navigation = [
  { name: 'Signup', href: '#' },
  // { name: 'Features', href: '#' },
  // { name: 'Marketplace', href: '#' },
  // { name: 'Company', href: '#' },
]

const Splash = () => {

  const [isDragOver, setIsDragOver] = useState(false);
  const navigate = useNavigate();

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    const allowedTypes = ['audio/mp3', 'audio/wav', 'audio/mpeg'];
    const maxSize = 10 * 1024 * 1024; // 10MB
  
    if (!allowedTypes.includes(file.type)) {
      alert('Error: Only .mp3 and .wav files are allowed.');
      return;
    }
  
    if (file.size > maxSize) {
      alert('Error: File size must be under 10MB.');
      return;
    }
  
    const formData = new FormData();
    formData.append('file', file);
  
    try {
      
      const response = await fetch(`${baseURL}/api/transcription`, {
        method: 'POST',
        body: formData,
      });
  
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
  
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transcription.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
  
    } catch (error) {
      console.error('Error:', error);
      alert('Error: Failed to upload the file.');
    }
  };



  return (
    <div className="relative overflow-hidden bg-white">
      <div className="hidden lg:absolute lg:inset-0 lg:block" aria-hidden="true">
        <svg
          className="absolute left-1/2 top-0 -translate-y-8 translate-x-64 transform"
          width={640}
          height={784}
          fill="none"
          viewBox="0 0 640 784"
        >
          <defs>
            <pattern
              id="9ebea6f4-a1f5-4d96-8c4e-4c2abf658047"
              x={118}
              y={0}
              width={20}
              height={20}
              patternUnits="userSpaceOnUse"
            >
              <rect x={0} y={0} width={4} height={4} className="text-gray-200" fill="currentColor" />
            </pattern>
          </defs>
          <rect y={72} width={640} height={640} className="text-gray-50" fill="currentColor" />
          <rect x={118} width={404} height={784} fill="url(#9ebea6f4-a1f5-4d96-8c4e-4c2abf658047)" />
        </svg>
      </div>

      <div className="relative pb-16 pt-6 sm:pb-24 lg:pb-32">
        <Popover>
          <nav className="relative mx-auto flex max-w-7xl items-center justify-between px-6" aria-label="Global">
            <div className="flex flex-1 items-center">
              <div className="flex w-full items-center justify-between md:w-auto">
                <a href="#">
                  <span className="sr-only">Your Company</span>
                  <img
                    className="h-8 w-auto sm:h-10"
                    src="https://tailwindui.com/img/logos/mark.svg?color=indigo&shade=600"
                    alt=""
                  />
                </a>
                <div className="-mr-2 flex items-center md:hidden">
                  <PopoverButton className="relative inline-flex items-center justify-center rounded-md bg-white p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500">
                    <span className="absolute -inset-0.5" />
                    <span className="sr-only">Open main menu</span>
                    <Bars3Icon className="h-6 w-6" aria-hidden="true" />
                  </PopoverButton>
                </div>
              </div>
              <div className="hidden md:ml-10 md:block md:space-x-10">
                {navigation.map((item) => (
                  <a key={item.name} href={item.href} className="font-medium text-gray-500 hover:text-gray-900" onClick={() => navigate('/user')}>
                    {item.name}
                  </a>
                ))}
              </div>
            </div>

          </nav>

          <PopoverPanel
            transition
            focus
            className="absolute inset-x-0 top-0 z-10 origin-top-right transform p-2 transition data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-150 data-[leave]:duration-100 data-[enter]:ease-out data-[leave]:ease-in md:hidden"
          >
            <div className="overflow-hidden rounded-lg bg-white shadow-md ring-1 ring-black ring-opacity-5">
              <div className="flex items-center justify-between px-5 pt-4">
                <div>
                  <img
                    className="h-8 w-auto"
                    src="https://tailwindui.com/img/logos/mark.svg?color=indigo&shade=600"
                    alt=""
                  />
                </div>
                <div className="-mr-2">
                  <PopoverButton className="relative inline-flex items-center justify-center rounded-md bg-white p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500">
                    <span className="absolute -inset-0.5" />
                    <span className="sr-only">Close main menu</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </PopoverButton>
                </div>
              </div>
              <div className="space-y-1 px-2 pb-3 pt-2">
                {navigation.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    {item.name}
                  </a>
                ))}
              </div>
              <a
                href="#"
                className="block w-full bg-gray-50 px-5 py-3 text-center font-medium text-indigo-600 hover:bg-gray-100"
              >
                Log in
              </a>
            </div>
          </PopoverPanel>
        </Popover>

        <main className="mx-auto mt-16 max-w-7xl px-4 px-6 sm:mt-24 lg:mt-32">
          <div className="lg:grid lg:grid-cols-12 lg:gap-8">
            <div className="sm:text-center md:mx-auto md:max-w-2xl lg:col-span-6 lg:text-left">
              <h1>
                {/* <span className="block text-base font-semibold text-gray-500 sm:text-lg lg:text-base xl:text-lg">
                  Coming soon
                </span> */}
                <span className="mt-1 block text-4xl font-bold tracking-tight sm:text-5xl xl:text-6xl">
                  <span className="block text-gray-900">Fast Transcription</span>
                  <span className="block text-indigo-600">fully secure</span>
                </span>
              </h1>
              <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
              This website offers a fast and secure drag-and-drop audio transcription service, allowing users to download their transcripts directly or receive them via email.
              </p>
              <div className="mt-8 sm:mx-auto sm:max-w-lg sm:text-center lg:mx-0 lg:text-left">
                <p className="text-base font-medium text-gray-900">Input your email to recieve your transcription</p>
                <form action="#" method="POST" className="mt-3 sm:flex">
                  <label htmlFor="email" className="sr-only">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    className="block w-full rounded-md border-gray-300 py-3 text-base placeholder-gray-500 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:flex-1"
                    placeholder="Enter your email"
                  />
                  <button
                    type="submit"
                    className="mt-3 w-full rounded-md border border-transparent bg-gray-800 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:ml-3 sm:mt-0 sm:inline-flex sm:w-auto sm:flex-shrink-0 sm:items-center"
                  >
                    Send it!
                  </button>
                </form>
                <p className="mt-3 text-sm text-gray-500">
                  Our dog has aids. Please keep him in your thoughts.
                </p>
              </div>
            </div>
            <div className="relative mt-12 sm:mx-auto sm:max-w-lg lg:col-span-6 lg:mx-0 lg:mt-0 lg:flex lg:max-w-none lg:items-center">
              <svg
                className="absolute left-1/2 top-0 origin-top -translate-x-1/2 -translate-y-8 scale-75 transform sm:scale-100 lg:hidden"
                width={640}
                height={784}
                fill="none"
                viewBox="0 0 640 784"
                aria-hidden="true"
              >
                <defs>
                  <pattern
                    id="4f4f415c-a0e9-44c2-9601-6ded5a34a13e"
                    x={118}
                    y={0}
                    width={20}
                    height={20}
                    patternUnits="userSpaceOnUse"
                  >
                    <rect x={0} y={0} width={4} height={4} className="text-gray-200" fill="currentColor" />
                  </pattern>
                </defs>
                <rect y={72} width={640} height={640} className="text-gray-50" fill="currentColor" />
                <rect x={118} width={404} height={784} fill="url(#4f4f415c-a0e9-44c2-9601-6ded5a34a13e)" />
              </svg>

                {/* this thing here is the upload div */}
                <div className="relative mx-auto w-full rounded-lg shadow-lg lg:max-w-md">
      <div
        className={`mt-2 flex justify-center rounded-lg border-2 border-dashed px-6 py-10 ${
          isDragOver ? 'border-[color:#99C24D]' : 'border-[color:#603990]'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <ArrowUpTrayIcon className={`mx-auto h-40 w-12 ${isDragOver ? '[color:#99C24D]' : '[color:#603990]'}`} aria-hidden="true" />
          <div className="mt-4 flex text-sm leading-6 text-gray-600">
            <label
              htmlFor="file-upload"
              className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 hover:text-indigo-500"
            >
              <span>Upload a file</span>
              <input id="file-upload" name="file-upload" type="file" className="sr-only" />
            </label>
            <p className="pl-1">or drag and drop</p>
          </div>
          <p className="text-xs leading-5 text-gray-600">MP3, WAV, GIF up to 10MB</p>
        </div>
      </div>
    </div>


            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default Splash