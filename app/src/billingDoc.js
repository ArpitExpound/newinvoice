// 📁 src/billingDoc.js
import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Box,
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Spinner,
  Center,
  HStack,
  Button,
  Checkbox,
  IconButton,
  useToast,
} from "@chakra-ui/react";
import { ViewIcon, DownloadIcon } from "@chakra-ui/icons";
import InvoiceModal from "./InvoiceModal";

const API_BASE_URL = "http://localhost:4004/api/v1/";

const ITEMS_PER_PAGE = 10;

const BillingDashboard = () => {
  const [billingDocuments, setBillingDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const toast = useToast();

  // 🟢 GET - Fetch all billing documents
  useEffect(() => {
    const fetchBillingDocuments = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_BASE_URL}/billingDocument`);
        console.log("Billing Document Response:", res.data);

        setBillingDocuments(res.data.value || []);
      } catch (error) {
        toast({
          title: "Error fetching documents",
          description: error.message,
          status: "error",
          duration: 4000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchBillingDocuments();
  }, [toast]);

  const totalPages = Math.ceil(billingDocuments.length / ITEMS_PER_PAGE);
  const paginatedData = billingDocuments.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // 🟣 POST - Fetch specific document details (for modal)
  const fetchDocumentDetails = async (billingDocumentId) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/billingDocument`, {
        BillingDocument: billingDocumentId,
      });
      return res.data;
    } catch (err) {
      toast({
        title: "Error fetching detailed document",
        description: err.message,
        status: "error",
        duration: 4000,
        isClosable: true,
      });
      return null;
    }
  };

  const handlePreview = async () => {
    if (!selectedDoc) {
      toast({
        title: "Please select a document first",
        status: "warning",
        duration: 2500,
        isClosable: true,
      });
      return;
    }

    const detailedDoc = await fetchDocumentDetails(selectedDoc.BillingDocument);
    if (detailedDoc) {
      setSelectedDoc(detailedDoc); // Replace with enriched version
      setIsModalOpen(true);
    }
  };

  return (
    <Box p={6} bg="gray.50" minH="100vh">
      <HStack justify="space-between" mb={6}>
        <Heading fontSize="2xl" color="blue.700">
          Billing Document List
        </Heading>
        <HStack spacing={3}>
          <IconButton
            icon={<ViewIcon />}
            colorScheme="blue"
            variant="outline"
            onClick={handlePreview}
          />
          <IconButton
            icon={<DownloadIcon />}
            colorScheme="green"
            variant="outline"
            onClick={handlePreview}
          />
        </HStack>
      </HStack>

      <Box p={4} bg="white" borderRadius="md" boxShadow="lg" overflowX="auto">
        {loading ? (
          <Center h="200px">
            <Spinner size="xl" color="blue.500" />
          </Center>
        ) : (
          <>
            <Table size="md" variant="simple">
              <Thead bg="blue.100">
                <Tr>
                  <Th>Select</Th>
                  <Th>BillingDocument</Th>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>CompanyCode</Th>
                  <Th>FiscalYear</Th>
                  <Th>SalesOrg</Th>
                  <Th>Division</Th>
                  <Th>Customer</Th>
                </Tr>
              </Thead>
              <Tbody>
                {paginatedData.map((doc) => (
                  <Tr key={doc.BillingDocument} _hover={{ bg: "gray.100" }}>
                    <Td>
                      <Checkbox
                        isChecked={selectedDoc?.BillingDocument === doc.BillingDocument}
                        onChange={() =>
                          setSelectedDoc(
                            selectedDoc?.BillingDocument === doc.BillingDocument ? null : doc
                          )
                        }
                      />
                    </Td>
                    <Td>{doc.BillingDocument}</Td>
                    <Td>{doc.BillingDocumentDate}</Td>
                    <Td>{doc.BillingDocumentType}</Td>
                    <Td>{doc.CompanyCode}</Td>
                    <Td>{doc.FiscalYear}</Td>
                    <Td>{doc.SalesOrganization}</Td>
                    <Td>{doc.Division}</Td>
                    <Td>{doc.CustomerName || "-"}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            <HStack spacing={4} mt={4} justify="center">
              <Button onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1}>
                Previous
              </Button>
              <Box fontWeight="semibold">
                Page {currentPage} of {totalPages}
              </Box>
              <Button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </HStack>
          </>
        )}
      </Box>

      <InvoiceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedDoc={selectedDoc}
      />
    </Box>
  );
};

export default BillingDashboard;
